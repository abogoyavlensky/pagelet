// The owner's order of the websites: a card dragged by its handle onto
// another takes its place, the order is saved and outlives a reload, and a
// failed save puts the cards back. Other specs add sites to the same list
// while this one runs, so only the order of this spec's own two is checked.
import { test, expect } from '@playwright/test';
import { apiLogin, createSite, deleteSite, signIn, uniqueDomain } from './helpers.js';

const card = (page, domain) => page.getByTestId('site-card').filter({ hasText: domain });

// The domains of `domains` in the order the overview shows them.
async function shown(page, domains) {
  const texts = await page.getByTestId('site-card').allInnerTexts();
  return texts.map((t) => domains.find((d) => t.includes(d))).filter(Boolean);
}

async function listed(request, domains) {
  const sites = await (await request.get('/api/sites')).json();
  return sites.map((s) => s.domain).filter((d) => domains.includes(d));
}

// Press on `domain`'s handle and let go over the middle of `onto`'s card.
// dnd-kit follows the pointer, so the move goes in steps.
async function drag(page, domain, onto) {
  await card(page, onto).scrollIntoViewIfNeeded();
  await card(page, domain).scrollIntoViewIfNeeded();
  const handle = await page.getByRole('button', { name: `Reorder ${domain}` }).boundingBox();
  const target = await card(page, onto).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 10, handle.y + 10, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();
}

const saving = (page) => page.waitForResponse((r) => r.url().endsWith('/api/sites/order') && r.request().method() === 'PUT');

test('drag a website into another place; the order is kept', async ({ page, request }) => {
  await apiLogin(request);
  const first = uniqueDomain('order-a');
  const second = uniqueDomain('order-b');
  const a = await createSite(request, first, first);
  const b = await createSite(request, second, second);
  const ours = [first, second];
  try {
    await signIn(page);
    await expect(page.locator('header')).toContainText('Pagelet');
    await expect(card(page, second)).toBeVisible();
    // A new site goes last, so the two are in the order they were made.
    expect(await shown(page, ours)).toEqual([first, second]);

    const saved = saving(page);
    await drag(page, second, first);
    expect((await saved).status()).toBe(200);
    await expect.poll(() => shown(page, ours)).toEqual([second, first]);
    expect(await listed(request, ours)).toEqual([second, first]);

    await page.reload();
    await expect(card(page, first)).toBeVisible();
    expect(await shown(page, ours)).toEqual([second, first]);

    // The card is still a link to its site.
    await card(page, first).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/sites/${a.id}$`));
  } finally {
    await deleteSite(request, a.id);
    await deleteSite(request, b.id);
  }
});

test('a failed save puts the cards back', async ({ page, request }) => {
  await apiLogin(request);
  const first = uniqueDomain('order-c');
  const second = uniqueDomain('order-d');
  const a = await createSite(request, first, first);
  const b = await createSite(request, second, second);
  const ours = [first, second];
  try {
    await signIn(page);
    await expect(card(page, second)).toBeVisible();
    await page.route('**/api/sites/order', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }));

    await drag(page, second, first);
    await expect(page.getByRole('alert')).toHaveText('Could not save the order.');
    expect(await shown(page, ours)).toEqual([first, second]);
    expect(await listed(request, ours)).toEqual([first, second]);
  } finally {
    await deleteSite(request, a.id);
    await deleteSite(request, b.id);
  }
});

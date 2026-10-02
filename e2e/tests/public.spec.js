// A public site: the owner turns it on in Settings, and a browser with no
// session reads the dashboard at the same URL with nothing of the owner's
// on it. A session that runs out on a public site falls back to that view;
// turned off again, the page sends visitors to the login page.
import { test, expect } from '@playwright/test';
import { apiLogin, createSite, deleteSite, signIn, uniqueDomain } from './helpers.js';

test('a public site reads without a session, and closes again', async ({ browser, page, request, baseURL }) => {
  await apiLogin(request);
  const domain = uniqueDomain('public');
  const site = await createSite(request, domain, domain);
  for (const path of ['/', '/about']) {
    const res = await request.post('/api/event', {
      headers: { 'Content-Type': 'text/plain' },
      data: JSON.stringify({ d: domain, u: `https://${domain}${path}`, r: '', n: 'pageview' }),
    });
    expect(res.status()).toBe(202);
  }
  const url = `/sites/${site.id}`;

  // Private: a visitor is sent to sign in.
  const visitorContext = await browser.newContext({ baseURL });
  const visitor = await visitorContext.newPage();
  await visitor.goto(url);
  await expect(visitor).toHaveURL(/\/login$/);

  // The owner makes it public from Settings and gets the link. The buffer
  // flushes every 300 ms; wait for the numbers, not the waiting card.
  await signIn(page);
  await page.goto(url);
  await expect(page.getByTestId('stat-pageviews')).toHaveText(/^Pageviews\s*2(?!\d)/, { timeout: 20_000 });
  // The box moves before the save lands, so wait for the save itself.
  const saved = () => page.waitForResponse((r) => r.url().endsWith(`/api/sites/${site.id}`) && r.request().method() === 'PUT' && r.ok());
  await page.getByRole('button', { name: 'Site settings' }).click();
  const madePublic = saved();
  await page.getByLabel('Anyone with the link can view this dashboard').check();
  await madePublic;
  await expect(page.getByLabel('Public link')).toHaveValue(new RegExp(`/sites/${site.id}$`));

  // The visitor reads it, with nothing of the owner's on screen.
  await visitor.goto(url);
  await expect(visitor).toHaveURL(new RegExp(`${url}$`));
  await expect(visitor.getByTestId('stat-pageviews')).toHaveText(/^Pageviews\s*2(?!\d)/);
  await expect(visitor.getByTestId('online-now')).toBeVisible();
  await expect(visitor.getByTestId('site-label')).toContainText(domain);
  await expect(visitor.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Site settings' })).toHaveCount(0);
  await expect(visitor.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await expect(visitor.getByRole('button', { name: /Switch website/ })).toHaveCount(0);
  expect((await visitorContext.request.get('/api/sites')).status()).toBe(401);

  // A session that runs out on a public site falls back to the visitor's
  // view instead of the login page. The site's reports still answer without
  // the cookie, so the page learns of it when it next asks: here, a reload.
  const lapsedContext = await browser.newContext({ baseURL });
  const lapsed = await lapsedContext.newPage();
  await signIn(lapsed);
  await lapsed.goto(`${url}?period=30d`);
  await expect(lapsed.getByRole('button', { name: 'Site settings' })).toBeVisible();
  await lapsedContext.clearCookies();
  await lapsed.reload();
  await expect(lapsed.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(lapsed).toHaveURL(new RegExp(`${url}\\?period=30d$`));
  await expect(lapsed.getByTestId('stat-pageviews')).toHaveText(/^Pageviews\s*2(?!\d)/);
  await expect(lapsed.getByRole('alert')).toHaveCount(0);

  // Private again: closed at once.
  const checkbox = page.getByLabel('Anyone with the link can view this dashboard');
  const madePrivate = saved();
  await checkbox.uncheck();
  await madePrivate;
  await expect(page.getByLabel('Public link')).toHaveCount(0);
  await visitor.reload();
  await expect(visitor).toHaveURL(/\/login$/);

  await deleteSite(request, site.id);
  await visitorContext.close();
  await lapsedContext.close();
});

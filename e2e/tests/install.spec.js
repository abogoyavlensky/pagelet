// The dashboard as an installable app: the head links the manifest, the
// Apple touch icon and the theme colours, and the manifest and every icon
// come back from the binary with their types, the icons byte for byte.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const publicDir = new URL('../../ui/public/', import.meta.url);

// A PNG served by the binary is the very file in ui/public/.
async function expectPng(request, url) {
  const res = await request.get(url);
  expect(res.status(), url).toBe(200);
  expect(res.headers()['content-type'], url).toBe('image/png');
  const name = new URL(url, 'http://x').pathname.split('/').pop();
  const want = readFileSync(new URL(name, publicDir));
  expect(Buffer.compare(await res.body(), want), `${url} bytes`).toBe(0);
}

test('the head links the manifest, the touch icon and the theme colours', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/app/manifest.webmanifest');
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/app/apple-touch-icon.png');
  await expect(page.locator('meta[name=theme-color]')).toHaveCount(2);
});

test('the manifest and its icons come back from the binary', async ({ request }) => {
  const res = await request.get('/app/manifest.webmanifest');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/manifest+json');
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');

  // Icon srcs are relative to the manifest.
  const base = new URL(res.url());
  const icons = new Set(manifest.icons.map((i) => new URL(i.src, base).pathname));
  expect(icons.size).toBeGreaterThan(0);
  for (const path of icons) await expectPng(request, path);
  await expectPng(request, '/app/apple-touch-icon.png');
});

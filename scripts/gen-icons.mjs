// Writes the dashboard's app icons into ui/public/ from its favicon:
//
//   node scripts/gen-icons.mjs
//
// Run it after changing ui/public/favicon.svg and commit the PNGs. The
// icons are drawn full-bleed: the favicon's tile loses its rounded corners
// (the rx on its <rect>), because launchers apply their own mask. The host
// has no SVG rasteriser, so this borrows the e2e tests' Playwright and
// headless Chromium (`lgx e2e-setup` installs them). It is a one-off tool,
// not a build step, so `lgx build` needs no browser.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// ES module imports resolve from this directory, which has no node_modules.
const require = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = require('playwright');

const publicDir = new URL('../ui/public/', import.meta.url);
const sizes = { 'icon-192': 192, 'icon-512': 512, 'apple-touch-icon': 180 };

const favicon = readFileSync(new URL('favicon.svg', publicDir), 'utf8');
const svg = favicon.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, '$1');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</body></html>`);
  for (const [name, size] of Object.entries(sizes)) {
    await page.setViewportSize({ width: size, height: size });
    const path = fileURLToPath(new URL(`${name}.png`, publicDir));
    await page.screenshot({ path });
    console.log(`${path} (${size}x${size})`);
  }
} finally {
  await browser.close();
}

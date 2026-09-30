// Browser tests against the built binary. `lgx e2e` builds ../bin/pagelet
// and runs `npx playwright test` here; Playwright starts the binary itself
// (webServer) on a test port with a throwaway database, waits for the
// health check, runs the specs, and stops it on teardown.
import { defineConfig, devices } from '@playwright/test';

// Headless Chromium says "HeadlessChrome", which the server counts as a bot
// and drops. Beacons go out from the browser process and ignore a page's
// userAgent, so the agent is set browser-wide with a launch flag.
export const userAgent =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export const password = 'test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8099',
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        `--user-agent=${userAgent}`,
        // The tracked app is on a made-up public host and the tracker on
        // loopback; Chromium's local network access checks block a public
        // page from loading loopback resources. A real deployment is public
        // to public.
        '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], userAgent } }],
  webServer: {
    command: 'rm -f .tmp/pagelet.duckdb .tmp/pagelet.duckdb.wal && mkdir -p .tmp && ../bin/pagelet',
    url: 'http://127.0.0.1:8099/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    // A dedicated port so a developer's `lgx run` on 8080 can coexist.
    env: {
      PORT: '8099',
      DB_PATH: '.tmp/pagelet.duckdb',
      ADMIN_PASSWORD: password,
      FLUSH_INTERVAL_MS: '300',
    },
  },
});

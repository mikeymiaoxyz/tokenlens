import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const clientDistDir = fileURLToPath(new URL('../dist/client', import.meta.url));

const meta = {
  generatedAt: '2026-05-13T00:00:00.000Z',
  cached: false,
  warnings: [],
};

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css';
    case '.html':
      return 'text/html';
    case '.js':
      return 'text/javascript';
    default:
      return 'application/octet-stream';
  }
}

async function mockBuiltClient(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/' && url.pathname !== '/index.html' && !url.pathname.startsWith('/assets/')) {
      await route.fallback();
      return;
    }

    const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const filePath = join(clientDistDir, relativePath);
    const body = await readFile(filePath);
    await route.fulfill({
      body,
      contentType: contentTypeFor(filePath),
      status: 200,
    });
  });
}

async function mockDashboardApis(page: Page) {
  await page.route('**/api/providers', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { name: 'all', displayName: 'All', available: true, sourceCount: 6, toolSources: [] },
          { name: 'claude', displayName: 'Claude Code', available: true, sourceCount: 2, toolSources: [] },
          { name: 'codex', displayName: 'Codex', available: true, sourceCount: 1, toolSources: [] },
          { name: 'hermes', displayName: 'Hermes', available: true, sourceCount: 1, toolSources: [] },
          { name: 'openclaw', displayName: 'OpenClaw', available: true, sourceCount: 1, toolSources: [] },
          { name: 'gemini', displayName: 'Gemini CLI', available: true, sourceCount: 1, toolSources: [] },
        ],
        meta,
      }),
    });
  });

  await page.route('**/api/daily**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            date: '2026-05-13',
            inputTokens: 100,
            outputTokens: 30,
            cacheReadTokens: 400,
            cacheWriteTokens: 50,
            reasoningTokens: 0,
            totalTokens: 130,
            totalCost: 0.42,
            estimatedCost: true,
            calls: 3,
            sessions: 1,
            providers: [],
            models: [
              {
                modelName: 'claude-3-5-sonnet',
                provider: 'claude',
                inputTokens: 100,
                outputTokens: 30,
                cacheReadTokens: 400,
                cacheWriteTokens: 50,
                reasoningTokens: 0,
                totalTokens: 130,
                totalCost: 0.42,
                estimatedCost: true,
                calls: 3,
              },
            ],
          },
        ],
        meta,
      }),
    });
  });

  await page.route('**/api/projects**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta }),
    });
  });

  await page.route('**/api/analytics**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          codeChangeTrend: [],
          productivityKPIs: {
            activeDaysWithEdits: 0,
            addDeleteRatio: 0,
            avgLinesPerEdit: 0,
            filesModifiedPerDay: 0,
            totalEdits: 0,
            totalFilesModified: 0,
          },
          toolCallTrend: [],
          toolUsageDistribution: [],
        },
        meta,
      }),
    });
  });

  await page.route('**/api/hourly-activity**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { entries: [] }, meta }),
    });
  });
}

async function openMockedDashboard(page: Page) {
  await mockDashboardApis(page);
  await mockBuiltClient(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

test.describe('TokenLens Dashboard', () => {
  test('health API returns ok status', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.service).toBe('tokenlens');
  });

  test('providers API returns JSON', async ({ request }) => {
    const res = await request.get('/api/providers');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json).toHaveProperty('data');
    expect(json).toHaveProperty('meta');
  });

  test('homepage serves HTML', async ({ page }) => {
    await mockBuiltClient(page);
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    const content = await page.content();
    expect(content).toContain('TokenLens');
  });

  test('homepage shows heading text', async ({ page }) => {
    await openMockedDashboard(page);
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent();
    expect(body).toContain('TokenLens');
  });
});

test.describe('Total tokens card', () => {
  test('total tokens card has click to switch and formula', async ({ page }) => {
    await openMockedDashboard(page);

    const card = page.getByTestId('total-tokens-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Total tokens');
    await expect(card).toContainText('Click to switch');
    await expect(card).toContainText('580');
    await expect(card).toContainText('input context + output context');
  });

  test('total tokens card toggles between context and raw modes', async ({ page }) => {
    await openMockedDashboard(page);

    const card = page.getByTestId('total-tokens-card');

    await expect(card).toContainText('580');
    await expect(card).toContainText('input context + output context');
    await expect(card).toContainText('input + cache read/write + output');

    await card.click();
    await expect(card).toContainText('130');
    await expect(card).toContainText('input token + output token');
    await expect(card).toContainText('input + output, excluding cache read/write');

    await card.click();
    await expect(card).toContainText('580');
    await expect(card).toContainText('input context + output context');
  });
});

test.describe('Provider switcher', () => {
  test('provider switcher keeps pinned providers visible', async ({ page }) => {
    await openMockedDashboard(page);

    await expect(page.getByTestId('provider-btn-all')).toBeVisible();
    await expect(page.getByTestId('provider-btn-claude')).toBeVisible();
    await expect(page.getByTestId('provider-btn-codex')).toBeVisible();
    await expect(page.getByTestId('provider-btn-hermes')).toBeVisible();
    await expect(page.getByTestId('provider-btn-openclaw')).toBeVisible();
  });

  test('provider switcher keeps non-pinned provider label after More selection', async ({ page }) => {
    await openMockedDashboard(page);

    await page.getByTestId('provider-btn-more').click();
    await page.getByTestId('provider-btn-gemini').click();

    await expect(page.getByTestId('provider-btn-more')).toContainText('Gemini CLI');
  });
});

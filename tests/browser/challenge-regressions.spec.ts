import {test, expect, type Page} from '@playwright/test';
import type {Evidence} from '../../src/contracts.js';

async function startChallenge(page: Page): Promise<Evidence> {
  const response = page.waitForResponse(item => item.url().endsWith('/api/challenges') && item.status() === 201);
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).click();
  const {evidence} = await (await response).json();
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
  return evidence;
}

async function chooseJustifiedAnswer(page: Page, evidence: Evidence): Promise<string> {
  const candidates = evidence.issuances.filter(item => item.amountSat === evidence.redemption.amountSat && item.observedAtMs <= evidence.redemption.observedAtMs);
  expect(candidates.length).toBeGreaterThan(0);
  if (candidates.length !== 1) {
    await page.getByRole('button', {name: 'Evidence is insufficient', exact: true}).click();
    return 'insufficient-evidence';
  }
  const index = evidence.issuances.findIndex(item => item.eventId === candidates[0]!.eventId);
  await page.getByRole('button', {name: new RegExp(`^Inspect issuance ${index + 1}:`)}).click();
  await page.getByRole('button', {name: 'Choose this issuance', exact: true}).click();
  return candidates[0]!.eventId;
}

async function finishManually(page: Page): Promise<void> {
  const panel = page.locator('.reveal-step');
  for (const expectedStep of ['time', 'compatible', 'truth']) {
    await page.getByRole('button', {name: 'Next evidence step', exact: true}).focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveAttribute('data-step', expectedStep);
    await expect(panel.getByRole('heading')).toBeFocused();
  }
}

test('a delayed challenge response cannot replace the guided case selected afterwards', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
  let release!: () => void;
  let arrived!: () => void;
  let delivered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { arrived = resolve; });
  const delivery = new Promise<void>(resolve => { delivered = resolve; });
  let staleRunId = '';
  await page.route('**/api/challenges', async route => {
    const response = await route.fetch();
    staleRunId = (await response.json()).evidence.runId;
    arrived();
    await gate;
    await route.fulfill({response});
    delivered();
  }, {times: 1});
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).click();
  await intercepted;
  const guidedResponse = page.waitForResponse(item => item.url().endsWith('/api/runs') && item.status() === 201);
  await page.getByRole('button', {name: 'Guided story', exact: true}).click();
  const guided = (await (await guidedResponse).json()).evidence as Evidence;
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
  release();
  await delivery;
  await expect(page.getByRole('button', {name: 'Guided story', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', {name: 'Act I: The visible trail', exact: true})).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', {name: 'Every trail starts with a clue.', exact: true})).toBeVisible();
  await page.locator('#method > summary').click();
  await page.getByText('View observation JSON', {exact: true}).click();
  await expect(page.locator('#method pre')).toContainText(guided.runId);
  await expect(page.locator('#method pre')).not.toContainText(staleRunId);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a lost challenge reveal retries its committed guess and scores the conclusion once', async ({page}) => {
  await page.goto('/');
  const evidence = await startChallenge(page);
  const guess = await chooseJustifiedAnswer(page, evidence);
  const attempts: unknown[] = [];
  const serverResults: unknown[] = [];
  await page.route(`**/api/runs/${evidence.runId}/reveal`, async route => {
    attempts.push(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    serverResults.push(await response.json());
    if (attempts.length === 1) await route.abort('failed');
    else await route.fulfill({response});
  });
  await page.getByRole('button', {name: 'Reveal result', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Your submitted guess is retained');
  await expect(page.getByText('Justified conclusions: 0 / 0', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Evidence is insufficient', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: /^Inspect issuance 1:/}).click();
  await expect(page.getByRole('button', {name: 'Choose this issuance', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Retry same guess', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Your reasoning holds.', exact: true})).toBeVisible();
  expect(attempts).toEqual([{guess}, {guess}]);
  expect(serverResults).toHaveLength(2);
  expect(serverResults[1]).toEqual(serverResults[0]);
  await expect(page.getByText('Justified conclusions: 1 / 1', {exact: true})).toBeVisible();
  await finishManually(page);
  await page.getByRole('button', {name: 'Previous evidence step', exact: true}).click();
  await page.getByRole('button', {name: 'Next evidence step', exact: true}).click();
  await expect(page.getByText('Justified conclusions: 1 / 1', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Next case', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Case 02', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
  await expect(page.getByText('Justified conclusions: 1 / 1', {exact: true})).toBeVisible();
  expect(attempts).toHaveLength(2);
});

for (const [label, width] of [['desktop', 1440], ['mobile', 390]] as const) {
  test(`compact challenge comparison and manual reveal work at ${width}px with reduced motion`, async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({width, height: 960});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto('/');
    const evidence = await startChallenge(page);
    await expect(page.locator('.app-shell')).toHaveClass(/is-playing/);
    await expect(page.getByRole('button', {name: 'Enter the investigation', exact: true})).toHaveCount(0);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await page.getByRole('button', {name: /^Inspect issuance 1:/}).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', {name: 'Pin for comparison', exact: true}).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('My assessment', {exact: true}).selectOption('keep');
    await page.getByRole('button', {name: /^Inspect issuance 2:/}).click();
    await page.getByRole('button', {name: 'Pin for comparison', exact: true}).click();
    const comparison = page.getByRole('region', {name: 'Pinned comparison'});
    await expect(comparison.getByRole('article')).toHaveCount(3);
    await expect(comparison).toContainText('Spent proof');
    await expect(comparison).toContainText('Issuance 01');
    await expect(comparison).toContainText('Issuance 02');
    await expect(page.getByRole('button', {name: 'Reveal result', exact: true})).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path: `test-results/improved-${label}.png`, fullPage: true});

    await chooseJustifiedAnswer(page, evidence);
    await page.getByRole('button', {name: 'Reveal result', exact: true}).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.reveal-step')).toHaveAttribute('data-step', 'denomination');
    await expect(page.getByRole('button', {name: 'Previous evidence step', exact: true})).toBeDisabled();
    await expect(page.locator('.ground-source')).toHaveCount(0);
    await finishManually(page);
    await expect(page.getByText('Controlled source', {exact: true})).toBeVisible();
    await expect(page.locator('.ground-source')).toHaveCount(1);
    await expect(page.getByRole('button', {name: 'Next evidence step', exact: true})).toBeDisabled();
    const compatible = evidence.issuances.filter(item => item.amountSat === evidence.redemption.amountSat && item.observedAtMs <= evidence.redemption.observedAtMs);
    await expect(page.locator('.issuance.compatible')).toHaveCount(compatible.length);
    await expect(comparison.getByRole('article')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path: `test-results/improved-${label}-revealed.png`, fullPage: true});
    expect(errors).toEqual([]);
  });
}

import { test, expect, type Page } from "@playwright/test";
import type { Evidence } from "../../src/contracts.js";

async function challenge(page: Page): Promise<Evidence> {
  const response = page.waitForResponse(r => r.url().endsWith('/api/challenges') && r.status() === 201);
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).click();
  return (await (await response).json()).evidence;
}

async function finishSteps(page: Page) {
  for (let i = 0; i < 7; i++) {
    if (await page.locator('.reveal-step[data-step="truth"]').count()) return;
    await page.getByRole('button', {name: 'Next evidence step', exact: true}).click();
  }
  throw new Error('Reveal never reached the controlled-source step');
}

test('evidence desk supports independent comparison notes and resets them for another case', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'Enter the investigation', exact: true}).click();
  await expect(page.locator('.app-shell')).toHaveClass(/is-playing/);
  await page.getByRole('button', {name: /^Inspect issuance 1:/}).click();
  await page.getByRole('button', {name: 'Pin for comparison', exact: true}).click();
  await page.getByLabel('My assessment', {exact: true}).selectOption('amount');
  await page.getByRole('button', {name: /^Inspect issuance 2:/}).click();
  await page.getByRole('button', {name: 'Pin for comparison', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Pinned comparison'})).toContainText('Issuance 01');
  await expect(page.getByRole('region', {name: 'Pinned comparison'})).toContainText('Issuance 02');
  await expect(page.getByRole('button', {name: 'Reveal result', exact: true})).toBeDisabled();
  await expect(page.locator('.issuance.user-excluded')).toHaveCount(1);
  await expect(page.getByRole('button', {name: /^Inspect issuance 1:/})).toHaveAccessibleDescription(/My note: Exclude: denomination/);
  await page.getByRole('button', {name: 'New run', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Pinned comparison'})).toHaveCount(0);
  await expect(page.locator('.issuance.user-excluded')).toHaveCount(0);
});

test('challenge keeps the solution hidden, evaluates reasoning, and reveals truth without narrowing compatibility', async ({page}) => {
  await page.goto('/');
  const evidence = await challenge(page);
  expect(JSON.stringify(evidence)).not.toMatch(/answerKey|sourceEventId|compatibleCount|seed/);
  const candidates = evidence.issuances.filter(item => item.amountSat === evidence.redemption.amountSat && item.observedAtMs <= evidence.redemption.observedAtMs);
  await expect(page.getByRole('heading', {name: 'Case 01', exact: true})).toBeVisible();
  await expect(page.getByRole('navigation', {name: 'Investigation acts'})).toHaveCount(0);
  await page.locator('#method > summary').click();
  await expect(page.getByText('Compatible sources', {exact: true})).toHaveCount(0);
  await expect(page.getByText('Elimination reasons', {exact: true})).toHaveCount(0);
  if (candidates.length === 1) {
    const index = evidence.issuances.findIndex(item => item.eventId === candidates[0]!.eventId);
    await page.getByRole('button', {name: new RegExp(`^Inspect issuance ${index + 1}:`)}).click();
    await page.getByRole('button', {name: 'Choose this issuance', exact: true}).click();
  } else {
    await page.getByRole('button', {name: 'Evidence is insufficient', exact: true}).click();
  }
  await page.getByRole('button', {name: 'Reveal result', exact: true}).click();
  await expect(page.getByText('Controlled source', {exact: true})).toHaveCount(0);
  await expect(page.locator('.ground-source')).toHaveCount(0);
  await finishSteps(page);
  await expect(page.getByText('Controlled source', {exact: true})).toBeVisible();
  await expect(page.locator('.issuance.compatible')).toHaveCount(candidates.length);
  await expect(page.locator('.ground-source')).toHaveCount(1);
  await expect(page.getByText('Justified conclusions: 1 / 1', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Next evidence step', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Previous evidence step', exact: true}).click();
  await expect(page.locator('.ground-source')).toHaveCount(0);
  await page.getByRole('button', {name: 'Next evidence step', exact: true}).click();
  await page.getByRole('button', {name: 'Next case', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Case 02', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Reveal result', exact: true})).toBeDisabled();
  await expect(page.getByText('Compatible sources', {exact: true})).toHaveCount(0);
});

test('guided blind reveal preserves all twelve candidates after the controlled source is shown', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'Act II: Blind issuance', exact: true}).click();
  await page.getByRole('button', {name: 'Evidence is insufficient', exact: true}).click();
  await page.getByRole('button', {name: 'Reveal result', exact: true}).click();
  await expect(page.locator('.ground-source')).toHaveCount(0);
  await finishSteps(page);
  await expect(page.locator('.issuance.compatible')).toHaveCount(12);
  await expect(page.getByRole('button', {name: /^Inspect issuance 1:/})).toHaveAccessibleDescription('Compatible');
  await expect(page.locator('.ground-source')).toHaveCount(1);
  await expect(page.locator('.truth-line')).toHaveAttribute('d', /^M [0-9]/);
  await expect(page.locator('.compatible-line')).toHaveCount(12);
  for (const line of await page.locator('.compatible-line').all()) {
    await expect(line).toHaveAttribute('d', /^M [0-9]/);
  }
  await expect(page.getByText('12 compatible issuance events', {exact: true})).toBeVisible();
});

test('guided decisions lead to a final comparison and a new mixed case', async ({page}) => {
  const firstResponse = page.waitForResponse(r => r.url().endsWith('/api/runs') && r.status() === 201);
  await page.goto('/');
  let evidence: Evidence = (await (await firstResponse).json()).evidence;
  for (let act = 0; act < 3; act++) {
    if (act === 1) {
      await page.getByRole('button', {name: 'Evidence is insufficient', exact: true}).click();
    } else {
      const index = evidence.issuances.findIndex(item => act === 0 ? item.serial === evidence.redemption.serial : item.amountSat === evidence.redemption.amountSat);
      await page.getByRole('button', {name: new RegExp(`^Inspect issuance ${index + 1}:`)}).click();
      await page.getByRole('button', {name: 'Choose this issuance', exact: true}).click();
    }
    await page.getByRole('button', {name: 'Reveal result', exact: true}).click();
    await finishSteps(page);
    if (act < 2) {
      const response = page.waitForResponse(r => r.url().endsWith('/api/runs') && r.status() === 201);
      await page.getByRole('button', {name: 'Continue to next act', exact: true}).click();
      evidence = (await (await response).json()).evidence;
    }
  }
  const summary = page.getByRole('region', {name: 'Your investigation so far'});
  await expect(summary).toBeVisible();
  await expect(summary.getByText('Your conclusion was justified.', {exact: true})).toHaveCount(3);
  await expect(summary).toContainText('12 compatible sources');
  await page.getByRole('button', {name: 'Try a mixed case', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Case 01', exact: true})).toBeVisible();
});

test('one-millisecond timing differences stay visible to the investigator', async ({page}) => {
  await page.route('**/api/challenges', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.evidence.redemption.observedAtMs = 5001;
    body.evidence.issuances[0].observedAtMs = 5002;
    await route.fulfill({response, json: body});
  });
  await page.goto('/');
  await challenge(page);
  await expect(page.locator('.target-time')).toHaveText('+5.001s');
  const issuance = page.getByRole('button', {name: /^Inspect issuance 1:/});
  await expect(issuance).toContainText('+5.002s');
  await issuance.click();
  await expect(page.locator('.target-reference')).toContainText('+5.001s');
  await page.getByRole('button', {name: 'Pin for comparison', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Pinned comparison'})).toContainText('+5.002s');
});

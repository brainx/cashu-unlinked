import {test, expect, type Page} from '@playwright/test';

async function loadBlind(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: 'Act II: Blind issuance', exact: true}).click();
  await expect(page.locator('.issuance')).toHaveCount(12);
}

test('desk shuffle preserves receipt identities, notes, guess and connection target', async ({page}) => {
  await loadBlind(page);
  const first = page.getByRole('button', {name: /^Inspect issuance 1:/});
  await first.click();
  await page.getByRole('button', {name: 'Pin for comparison', exact: true}).click();
  await page.getByLabel('My assessment', {exact: true}).selectOption('keep');
  await page.getByRole('button', {name: 'Choose this issuance', exact: true}).click();
  const before = await page.locator('.issuance').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  await page.getByRole('button', {name: 'Shuffle desk', exact: true}).click();
  const after = await page.locator('.issuance').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  expect(after).not.toEqual(before);
  expect([...after].sort()).toEqual([...before].sort());
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveAccessibleDescription(/Shortlisted/);
  await expect(page.locator('.connection-label')).toContainText('Issuance 01');
  await expect(page.locator('.hypothesis-line')).toHaveAttribute('d', /^M [0-9]/);
  await expect(page.getByRole('region', {name: 'Pinned comparison'})).toContainText('Issuance 01');
  await expect(page.getByRole('button', {name: 'Reveal result', exact: true})).toBeEnabled();
});

test('desk sounds are optional, stay off initially, and can be disabled again', async ({page}) => {
  await loadBlind(page);
  const sound = page.getByRole('button', {name: 'Desk sounds', exact: true});
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: /^Inspect issuance 1:/}).click();
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
});

test('receipt and stamp appear only at the final reveal and export a local artifact', async ({page}) => {
  await loadBlind(page);
  await expect(page.getByRole('button', {name: 'Save case receipt', exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'Evidence is insufficient', exact: true}).click();
  await page.getByRole('button', {name: 'Reveal result', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Save case receipt', exact: true})).toHaveCount(0);
  for (let step = 0; step < 6 && !await page.locator('.reveal-step[data-step="truth"]').count(); step++) {
    await page.getByRole('button', {name: 'Next evidence step', exact: true}).click();
  }
  await expect(page.getByRole('status', {name: 'Case conclusion'})).toContainText('JUSTIFIED');
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Save case receipt', exact: true}).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toMatch(/\.svg$/);
  expect(await artifact.failure()).toBeNull();
  await artifact.saveAs('test-results/case-receipt.svg');
  await page.getByRole('button', {name: 'Previous evidence step', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Save case receipt', exact: true})).toHaveCount(0);
});

test('unavailable audio fails honestly and leaves the desk usable', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', {value: class { constructor() { throw new Error('Unavailable audio'); } }});
  });
  await loadBlind(page);
  const sound = page.getByRole('button', {name: 'Desk sounds', exact: true});
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('status')).toContainText('Desk sounds are unavailable');
  await page.getByRole('button', {name: 'Shuffle desk', exact: true}).click();
  await expect(page.locator('.issuance')).toHaveCount(12);
});

test('mobile board controls advance the reveal in view and reset for a new case', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await loadBlind(page);
  await page.getByRole('button', {name: 'Evidence is insufficient', exact: true}).click();
  await page.getByRole('button', {name: 'Reveal result', exact: true}).click();
  const bar = page.getByRole('navigation', {name: 'Board replay controls'});
  await expect(bar).toBeVisible();
  await bar.getByRole('link', {name: /View evidence/}).click();
  await expect(page.getByRole('button', {name: 'Next board step', exact: true})).toBeInViewport();
  await page.getByRole('button', {name: 'Next board step', exact: true}).click();
  await expect(page.locator('.mechanism')).toContainText('Check the order of events');
  await expect(page.getByRole('button', {name: 'Next board step', exact: true})).toBeFocused();
  await page.getByRole('button', {name: 'Next board step', exact: true}).press('Enter');
  await expect(page.getByRole('button', {name: 'Next board step', exact: true})).toBeFocused();
  await expect(page.getByRole('button', {name: 'Next board step', exact: true})).toBeInViewport();
  await page.getByRole('button', {name: 'Next board step', exact: true}).click();
  await page.getByRole('button', {name: 'Shuffle desk', exact: true}).click();
  await expect(page.locator('.issuance.compatible')).toHaveCount(12);
  await expect(page.locator('.truth-line')).toHaveAttribute('d', /^M [0-9]/);
  await page.screenshot({path: 'test-results/desk-gimmicks-mobile.png', fullPage: true});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', {name: 'New run', exact: true}).click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Save case receipt', exact: true})).toHaveCount(0);
});

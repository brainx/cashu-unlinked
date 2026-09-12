import {test, expect, type Locator, type Page} from '@playwright/test';

const steps = [
  ['1. Bitcoin in', 'The bitcoin stays with the mint.'],
  ['2. Blind', 'Hide the secret. Keep the value visible.'],
  ['3. Sign', 'A signature without a visible serial link.'],
  ['4. Send', 'Send the token, not a ledger entry.'],
  ['5. Refresh', 'New proofs. Old copies stop working.'],
  ['6. Bitcoin out', 'Redeem the promise.'],
] as const;

async function load(page: Page) {
  const captures = page.waitForResponse(response => response.url().endsWith('/api/captures'));
  const first = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.status() === 201);
  await page.goto('/');
  const evidence = (await (await first).json()).evidence;
  await captures;
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
  return evidence;
}

async function openExplainer(page: Page): Promise<Locator> {
  await page.getByRole('button', {name: 'How Cashu works', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'How Cashu works', exact: true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', {name: 'How Cashu works', exact: true})).toBeFocused();
  return dialog;
}

test('Cashu explainer preserves a live case, comparison, and guess without making requests', async ({page}) => {
  await load(page);
  const response = page.waitForResponse(item => item.url().endsWith('/api/challenges') && item.status() === 201);
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).click();
  const {evidence} = await (await response).json();
  const first = page.getByRole('button', {name: /^Inspect issuance 1:/});
  await first.click();
  await page.getByRole('button', {name: 'Pin for comparison', exact: true}).click();
  await page.getByLabel('My assessment', {exact: true}).selectOption('keep');
  await page.getByRole('button', {name: 'Choose this issuance', exact: true}).click();
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const dialog = await openExplainer(page);
  await expect(dialog).not.toContainText(evidence.runId);
  for (const item of evidence.issuances) await expect(dialog).not.toContainText(item.eventId);
  await expect(dialog).not.toContainText(evidence.redemption.eventId);
  await expect(dialog).not.toContainText('Controlled source');
  await dialog.getByRole('button', {name: '2. Blind', exact: true}).click();
  await dialog.getByRole('button', {name: 'Mint view', exact: true}).click();
  await dialog.getByRole('button', {name: 'Close Cashu explainer', exact: true}).click();
  await expect(dialog).not.toBeVisible();
  const opener = page.getByRole('button', {name: 'How Cashu works', exact: true});
  await expect(opener).toBeFocused();
  await expect(page.getByRole('heading', {name: 'Case 01', exact: true})).toBeVisible();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveAccessibleDescription(/Shortlisted/);
  await expect(page.locator('.chosen-guess')).toHaveText('Issuance 01 selected');
  await expect(page.getByRole('region', {name: 'Pinned comparison'})).toContainText('Issuance 01');
  await expect(page.getByRole('button', {name: 'Reveal result', exact: true})).toBeEnabled();
  await expect(page.getByText('Justified conclusions: 0 / 0', {exact: true})).toBeVisible();
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(requests).toEqual([]);
});

test('all six Cashu steps expose distinct wallet and mint views and bounded navigation', async ({page}) => {
  await load(page);
  const dialog = await openExplainer(page);
  const walkthrough = dialog.getByRole('region', {name: 'Cashu walkthrough', exact: true});
  const wallet = dialog.getByRole('button', {name: 'Wallet view', exact: true});
  const mint = dialog.getByRole('button', {name: 'Mint view', exact: true});
  const previous = dialog.getByRole('button', {name: 'Previous Cashu step', exact: true});
  const next = dialog.getByRole('button', {name: 'Next Cashu step', exact: true});
  await expect(previous).toBeDisabled();
  for (const [navigation, title] of steps) {
    await dialog.getByRole('button', {name: navigation, exact: true}).click();
    await expect(walkthrough.getByRole('heading', {name: title, exact: true})).toBeVisible();
    await wallet.click();
    await expect(wallet).toHaveAttribute('aria-pressed', 'true');
    await expect(mint).toHaveAttribute('aria-pressed', 'false');
    const walletText = await walkthrough.innerText();
    await mint.click();
    await expect(mint).toHaveAttribute('aria-pressed', 'true');
    await expect(wallet).toHaveAttribute('aria-pressed', 'false');
    await expect(walkthrough).not.toHaveText(walletText);
    if (navigation === '4. Send') {
      await expect(walkthrough.getByText('Handoff not observed', {exact: true})).toBeVisible();
    }
    await expect(dialog.getByText('Concept illustration · no protocol operations', {exact: true})).toBeVisible();
  }
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(walkthrough.getByRole('heading', {name: steps[4][1], exact: true})).toBeVisible();
  await next.click();
  await expect(walkthrough.getByRole('heading', {name: steps[5][1], exact: true})).toBeVisible();
  await dialog.getByRole('button', {name: 'Back to investigation', exact: true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', {name: 'How Cashu works', exact: true})).toBeFocused();
});

test('Cashu knowledge check explains both answers and preserves lesson progress when reopened', async ({page}) => {
  await load(page);
  let dialog = await openExplainer(page);
  await dialog.getByRole('button', {name: '5. Refresh', exact: true}).click();
  await dialog.getByRole('button', {name: 'Mint view', exact: true}).click();
  const wrong = dialog.getByRole('button', {name: 'No. A signature prevents copies.', exact: true});
  const right = dialog.getByRole('button', {name: 'Yes. I need a successful refresh.', exact: true});
  await wrong.click();
  await expect(wrong).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.lesson-check').getByRole('status')).toContainText('A signature proves validity, not uniqueness of a copy.');
  await right.click();
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await expect(wrong).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.locator('.lesson-check').getByRole('status')).toContainText('Exactly.');
  await dialog.getByRole('button', {name: 'Close Cashu explainer', exact: true}).click();
  await expect(dialog).not.toBeVisible();
  dialog = await openExplainer(page);
  await expect(dialog.getByRole('heading', {name: steps[4][1], exact: true})).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Mint view', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', {name: 'Yes. I need a successful refresh.', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.lesson-check').getByRole('status')).toContainText('Exactly.');
});

for (const [name, width, height] of [['desktop', 1440, 960], ['mobile', 390, 844]] as const) {
  test(`Cashu explainer remains usable at ${width}px with reduced motion and modal keyboard focus`, async ({page}) => {
    await page.setViewportSize({width, height});
    await page.emulateMedia({reducedMotion: 'reduce'});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await load(page);
    const dialog = await openExplainer(page);
    const close = dialog.getByRole('button', {name: 'Close Cashu explainer', exact: true});
    const next = dialog.getByRole('button', {name: 'Next Cashu step', exact: true});
    const previous = dialog.getByRole('button', {name: 'Previous Cashu step', exact: true});
    await next.click();
    await expect(dialog.getByRole('heading', {name: steps[1][1], exact: true})).toBeVisible();
    await expect(next).toBeInViewport();
    await expect(previous).toBeInViewport();
    await expect(close).toBeInViewport();
    await dialog.getByRole('button', {name: 'Mint view', exact: true}).click();
    await expect(next).toBeInViewport();
    await expect(close).toBeInViewport();
    const layout = await dialog.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return {
        pageFits: document.documentElement.scrollWidth <= innerWidth,
        contentsFit: element.scrollWidth <= element.clientWidth,
        dialogFits: bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1,
      };
    });
    expect(layout).toEqual({pageFits: true, contentsFit: true, dialogFits: true});
    await page.screenshot({path: `test-results/cashu-explainer-${name}.png`});
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    for (let index = 0; index < 20; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', {name: 'How Cashu works', exact: true})).toBeFocused();
    expect(errors).toEqual([]);
  });
}

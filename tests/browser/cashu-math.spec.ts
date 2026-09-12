import {test, expect, type Locator, type Page} from '@playwright/test';

async function load(page: Page) {
  const captureResponse = page.waitForResponse(response => response.url().endsWith('/api/captures'));
  const runResponse = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.status() === 201);
  await page.goto('/');
  const evidence = (await (await runResponse).json()).evidence;
  await captureResponse;
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
  return evidence;
}

async function openMath(page: Page, shortcut = false): Promise<{dialog: Locator; lab: Locator}> {
  await page.getByRole('button', {name: 'How Cashu works', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'How Cashu works', exact: true});
  const summary = dialog.locator('summary').filter({hasText: 'The math, made visible'});
  const lab = dialog.getByRole('region', {name: 'Cashu math lab', exact: true});
  await expect(lab).not.toBeVisible();
  if (shortcut) {
    await dialog.getByRole('button', {name: 'Explore the math', exact: true}).click();
    await expect(summary).toBeFocused();
    await expect(summary).toBeInViewport();
    const summaryBounds = await summary.boundingBox();
    const headerBounds = await dialog.locator('.lesson-topbar').boundingBox();
    expect(summaryBounds).not.toBeNull();
    expect(headerBounds).not.toBeNull();
    expect(summaryBounds!.y).toBeGreaterThanOrEqual(headerBounds!.y + headerBounds!.height - 1);
  } else {
    await summary.focus();
    await page.keyboard.press('Enter');
  }
  await expect(lab).toBeVisible();
  return {dialog, lab};
}

test('the optional math lab changes only educational examples, preserving the selected case and making no requests', async ({page}) => {
  const evidence = await load(page);
  const first = page.getByRole('button', {name: /^Inspect issuance 1:/});
  await first.click();
  await page.getByRole('button', {name: 'Pin for comparison', exact: true}).click();
  await page.getByLabel('My assessment', {exact: true}).selectOption('keep');
  await page.getByRole('button', {name: 'Choose this issuance', exact: true}).click();
  const observations = await page.locator('.issuance').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const {dialog, lab} = await openMath(page, true);
  await expect(lab.getByRole('button', {name: 'Blinding math', exact: true})).toHaveAttribute('aria-pressed', 'true');
  const slider = lab.getByRole('slider', {name: 'Toy blinding factor r', exact: true});
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await lab.getByRole('button', {name: 'Denominations & fees', exact: true}).click();
  await lab.getByRole('spinbutton', {name: 'Example amount in sats', exact: true}).fill('255');
  await lab.getByLabel('Example input fee', {exact: true}).selectOption('500');
  await lab.getByRole('button', {name: 'Evidence & probability', exact: true}).click();
  await lab.getByRole('button', {name: 'Unequal priors', exact: true}).click();
  await expect(lab).not.toContainText(evidence.runId);
  for (const item of evidence.issuances) await expect(lab).not.toContainText(item.eventId);
  await expect(lab).not.toContainText(evidence.redemption.eventId);
  await dialog.getByRole('button', {name: 'Close Cashu explainer', exact: true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveAccessibleDescription(/Shortlisted/);
  await expect(page.locator('.chosen-guess')).toHaveText('Issuance 01 selected');
  await expect(page.getByRole('region', {name: 'Pinned comparison'})).toContainText('Issuance 01');
  expect(await page.locator('.issuance').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))).toEqual(observations);
  await expect(page.getByRole('button', {name: 'Reveal result', exact: true})).toBeEnabled();
  expect(requests).toEqual([]);
});

test('toy blinding changes the blinded message while the unblinded result stays invariant at both slider limits', async ({page}) => {
  await load(page);
  const {lab} = await openMath(page);
  await expect(lab).toContainText('Arithmetic only — not Cashu cryptography');
  const slider = lab.getByRole('slider', {name: 'Toy blinding factor r', exact: true});
  const message = lab.getByLabel('Blinded toy message', {exact: true});
  const result = lab.getByLabel('Unblinded toy result', {exact: true});
  await expect(slider).toHaveAttribute('min', '1');
  await expect(slider).toHaveAttribute('max', '96');
  await expect(slider).toHaveValue('9');
  await expect(message).toHaveText('56');
  await expect(result).toHaveText('77');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('10');
  await expect(message).toHaveText('61');
  await expect(result).toHaveText('77');
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('96');
  await expect(message).toHaveText('6');
  await expect(result).toHaveText('77');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('96');
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('1');
  await expect(message).toHaveText('16');
  await expect(result).toHaveText('77');
  await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveValue('1');
});

test('denomination and fee examples handle rounding, both bounds, zero usable output, and invalid entry', async ({page}) => {
  await load(page);
  const {lab} = await openMath(page);
  await lab.getByRole('button', {name: 'Denominations & fees', exact: true}).click();
  const amount = lab.getByRole('spinbutton', {name: 'Example amount in sats', exact: true});
  const feeRate = lab.getByLabel('Example input fee', {exact: true});
  const inputs = lab.getByLabel('Example proof denominations', {exact: true});
  const fee = lab.getByLabel('Calculated input fee', {exact: true});
  const outputs = lab.getByLabel('Example output denominations', {exact: true});
  await expect(amount).toHaveAttribute('min', '1');
  await expect(amount).toHaveAttribute('max', '255');
  await expect(amount).toHaveValue('13');
  await expect(feeRate).toHaveValue('100');
  await expect(inputs).toHaveText('8 + 4 + 1');
  await expect(fee).toHaveText(/^1(?:\s*sat)?$/);
  await expect(outputs).toHaveText('8 + 4');
  await amount.fill('255');
  await expect(inputs).toHaveText('128 + 64 + 32 + 16 + 8 + 4 + 2 + 1');
  for (const [rate, total, denominations] of [
    ['0', '0', '128 + 64 + 32 + 16 + 8 + 4 + 2 + 1'],
    ['100', '1', '128 + 64 + 32 + 16 + 8 + 4 + 2'],
    ['500', '4', '128 + 64 + 32 + 16 + 8 + 2 + 1'],
    ['1000', '8', '128 + 64 + 32 + 16 + 4 + 2 + 1'],
  ] as const) {
    await feeRate.selectOption(rate);
    await expect(fee).toHaveText(new RegExp(`^${total}(?:\\s*sat)?$`));
    await expect(outputs).toHaveText(denominations);
  }
  await amount.fill('1');
  await expect(fee).toHaveText(/^1(?:\s*sat)?$/);
  await expect(lab).toContainText(/no (?:usable|spendable) output/i);
  await feeRate.selectOption('0');
  await expect(fee).toHaveText(/^0(?:\s*sat)?$/);
  await expect(outputs).toHaveText('1');
  for (const invalid of ['', '0', '-1', '256', '1.5']) {
    await amount.fill(invalid);
    await expect(lab.getByRole('alert')).toBeVisible();
    await expect(outputs).not.toBeVisible();
  }
  await amount.fill('13');
  await expect(lab.getByRole('alert')).toHaveCount(0);
  await expect(inputs).toHaveText('8 + 4 + 1');
  await expect(outputs).toHaveText('8 + 4 + 1');
});

test('probability examples distinguish equal from unequal priors without estimating the current case', async ({page}) => {
  await load(page);
  const {lab} = await openMath(page);
  const mode = lab.getByRole('button', {name: 'Evidence & probability', exact: true});
  await mode.focus();
  await page.keyboard.press('Enter');
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  const a = lab.getByLabel('Hypothesis A probability', {exact: true});
  const b = lab.getByLabel('Hypothesis B probability', {exact: true});
  const equal = lab.getByRole('button', {name: 'Equal priors', exact: true});
  const unequal = lab.getByRole('button', {name: 'Unequal priors', exact: true});
  await equal.click();
  await expect(equal).toHaveAttribute('aria-pressed', 'true');
  await expect(unequal).toHaveAttribute('aria-pressed', 'false');
  await expect(a).toHaveText('50%');
  await expect(b).toHaveText('50%');
  await unequal.focus();
  await page.keyboard.press('Enter');
  await expect(unequal).toHaveAttribute('aria-pressed', 'true');
  await expect(equal).toHaveAttribute('aria-pressed', 'false');
  await expect(a).toHaveText('90%');
  await expect(b).toHaveText('10%');
  await expect(lab).toContainText(/not estimates for your (?:case|investigation)/i);
});

for (const [name, width, height] of [['desktop', 1440, 960], ['mobile', 390, 844]] as const) {
  test(`math lab remains readable and keyboard usable at ${width}px with reduced motion`, async ({page}) => {
    await page.setViewportSize({width, height});
    await page.emulateMedia({reducedMotion: 'reduce'});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await load(page);
    const {dialog, lab} = await openMath(page);
    for (const mode of ['Blinding math', 'Denominations & fees', 'Evidence & probability']) {
      const control = lab.getByRole('button', {name: mode, exact: true});
      await control.focus();
      await page.keyboard.press('Enter');
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      const layout = await dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return {
          pageFits: document.documentElement.scrollWidth <= innerWidth,
          contentFits: element.scrollWidth <= element.clientWidth,
          dialogFits: bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1,
        };
      });
      expect(layout).toEqual({pageFits: true, contentFits: true, dialogFits: true});
      await expect(dialog.getByRole('button', {name: 'Close Cashu explainer', exact: true})).toBeInViewport();
    }
    await lab.getByRole('button', {name: 'Blinding math', exact: true}).click();
    await lab.getByRole('slider', {name: 'Toy blinding factor r', exact: true}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(lab.getByLabel('Unblinded toy result', {exact: true})).toHaveText('77');
    await page.screenshot({path: `test-results/cashu-math-${name}.png`});
    if (name === 'desktop') {
      await page.setViewportSize({width: 1440, height: 1500});
      const math = dialog.locator('#cashu-math');
      await math.locator('summary').focus();
      // The section's scroll margin keeps its title below the sticky dialog header.
      await math.evaluate(element => element.scrollIntoView({block: 'start', behavior: 'instant'}));
      await page.screenshot({path: 'test-results/cashu-math-overview.png'});
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', {name: 'How Cashu works', exact: true})).toBeFocused();
    expect(errors).toEqual([]);
  });
}

import {test, expect, type Page} from '@playwright/test';

async function expectCase(page: Page, number: number) {
  await expect(page.getByRole('heading', {name: `Case ${String(number).padStart(2, '0')}`, exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
}

test('case numbering remains monotonic across skipped cases and guided-story switches', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).click();
  await expectCase(page, 1);
  await page.getByRole('button', {name: 'New case', exact: true}).click();
  await expectCase(page, 2);
  await page.getByRole('button', {name: 'New case', exact: true}).click();
  await expectCase(page, 3);
  await page.getByRole('button', {name: 'Guided story', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Act I: The visible trail', exact: true})).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).click();
  await expectCase(page, 4);
  await expect(page.getByText('Justified conclusions: 0 / 0', {exact: true})).toBeVisible();
});

test('retrying a failed challenge load retains its case number without adding a conclusion', async ({page}) => {
  await page.goto('/');
  await page.route('**/api/challenges', route => route.abort('failed'), {times: 1});
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Could not load this investigation');
  await expect(page.getByRole('heading', {name: 'Case 01', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Try again', exact: true}).click();
  await expectCase(page, 1);
  await page.getByRole('button', {name: 'New case', exact: true}).click();
  await expectCase(page, 2);
  await expect(page.getByText('Justified conclusions: 0 / 0', {exact: true})).toBeVisible();
});

test('entering the desk and loading another case preserves a useful keyboard focus', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('button', {name: /^Inspect issuance /})).toHaveCount(12);
  await page.getByRole('button', {name: 'Enter the investigation', exact: true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.chapter-heading h2')).toBeFocused();
  await page.getByRole('button', {name: 'Challenge mode', exact: true}).focus();
  await page.keyboard.press('Enter');
  await expectCase(page, 1);
  await expect(page.getByRole('heading', {name: 'Case 01', exact: true})).toBeFocused();
  await page.getByRole('button', {name: 'New case', exact: true}).focus();
  await page.keyboard.press('Enter');
  await expectCase(page, 2);
  await expect(page.getByRole('heading', {name: 'Case 02', exact: true})).toBeFocused();
});

test('observed serial details remain inspectable after submission without changing the committed guess', async ({page}) => {
  const response = page.waitForResponse(item => item.url().endsWith('/api/runs') && item.status() === 201);
  await page.goto('/');
  const {evidence} = await (await response).json();
  await page.getByRole('button', {name: /^Inspect issuance 1:/}).click();
  await page.getByRole('button', {name: 'Choose this issuance', exact: true}).click();
  await page.getByRole('button', {name: 'Reveal result', exact: true}).click();
  await expect(page.getByRole('region', {name: 'Evidence explanation'})).toBeVisible();
  await page.getByRole('button', {name: /^Inspect issuance 2:/}).click();
  await expect(page.getByRole('heading', {name: 'Issuance 02', exact: true})).toBeVisible();
  await expect(page.locator('.observation-data')).toContainText(evidence.issuances[1].serial);
  await expect(page.locator('button:enabled').filter({hasText: 'Choose this issuance'})).toHaveCount(0);
  for (let index = 0; index < 6 && await page.locator('.reveal-step[data-step="truth"]').count() === 0; index++) {
    await page.getByRole('button', {name: 'Next evidence step', exact: true}).click();
  }
  await expect(page.locator('.result-facts')).toContainText('Issuance 01');
});

import { test, expect } from "@playwright/test";
import type { Evidence } from "../../src/contracts.js";

async function loadAct(
  page: import("@playwright/test").Page,
  name?: string,
): Promise<Evidence> {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/runs") && r.status() === 201,
  );
  if (name) await page.getByRole("button", { name, exact: true }).click();
  else await page.goto("/");
  return (await (await response).json()).evidence;
}

test("reference serial can be inspected without implicitly choosing a hypothesis", async ({
  page,
}) => {
  const evidence = await loadAct(page);
  const source = evidence.issuances.findIndex(
    (item) => item.serial === evidence.redemption.serial,
  );
  await expect(page.locator(".target-proof")).toContainText(
    `…${evidence.redemption.serial!.slice(-6)}`,
  );
  await page
    .getByRole("button", {
      name: new RegExp(`^Inspect issuance ${source + 1}:`),
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Reveal result", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Choose this issuance", exact: true })
    .click();
  await expect(page.getByText("HYPOTHESIS", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A trail you can follow." }),
  ).toBeVisible();
  await expect(
    page.getByText("1 compatible issuance event", { exact: true }),
  ).toBeVisible();
});

test("blind issuance can be investigated and abstained from without pre-reveal answers", async ({
  page,
}) => {
  const payloads: unknown[] = [];
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/runs") && response.ok())
      payloads.push(await response.json());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Act II: Blind issuance", exact: true })
    .click();
  await expect(
    page.getByText("SYNTHETIC MODEL", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Inspect issuance / }),
  ).toHaveCount(12);
  await page
    .getByRole("button", { name: "Evidence is insufficient", exact: true })
    .click();
  const beforeReveal = JSON.stringify(payloads);
  expect(payloads.length).toBeGreaterThan(0);
  expect(beforeReveal).not.toMatch(
    /answerKey|sourceEventId|seed|wallet|mnemonic/,
  );
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(
    page.getByText("12 compatible issuance events", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The evidence has a limit." }),
  ).toBeVisible();
});

test("rare denomination supports one source and new run clears the reveal and guess", async ({
  page,
}) => {
  await loadAct(page);
  const evidence = await loadAct(page, "Act III: The metadata clue");
  const source = evidence.issuances.findIndex((item) => item.amountSat === 64);
  await page
    .getByRole("button", {
      name: new RegExp(`^Inspect issuance ${source + 1}:`),
    })
    .click();
  await page
    .getByRole("button", { name: "Choose this issuance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The denomination leaves a clue." }),
  ).toBeVisible();
  const nextResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/runs") && r.status() === 201,
  );
  await page.getByRole("button", { name: "New run", exact: true }).click();
  expect((await (await nextResponse).json()).evidence.runId).not.toBe(
    evidence.runId,
  );
  await expect(
    page.getByRole("button", { name: "Reveal result", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("GROUND TRUTH", { exact: true })).toHaveCount(0);
});

test("wrong source does not become an evidence-supported answer", async ({
  page,
}) => {
  const evidence = await loadAct(page);
  const wrong = evidence.issuances.findIndex(
    (item) => item.serial !== evidence.redemption.serial,
  );
  await page
    .getByRole("button", {
      name: new RegExp(`^Inspect issuance ${wrong + 1}:`),
    })
    .click();
  await page
    .getByRole("button", { name: "Choose this issuance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Follow the evidence once more." }),
  ).toBeVisible();
});

test("network failure can be retried and an obsolete act response cannot replace the current act", async ({
  page,
}) => {
  await page.route("**/api/runs", (route) => route.abort("failed"), {
    times: 1,
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Inspect issuance / }),
  ).toHaveCount(12);
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived: (() => void) | undefined;
  const intercepted = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/api/runs", async (route) => {
    if (route.request().postDataJSON().kind !== "cashu-blind") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    arrived!();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page
    .getByRole("button", { name: "Act II: Blind issuance", exact: true })
    .click();
  await intercepted;
  await loadAct(page, "Act III: The metadata clue");
  release!();
  await expect(
    page.getByRole("button", { name: "Inspect spent proof: 64 sats" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Same cryptography. Different clues." }),
  ).toBeVisible();
});

test("keyboard, reduced motion, mobile and desktop keep the investigation usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadAct(page);
  const first = page.getByRole("button", { name: /^Inspect issuance 1:/ });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Issuance 01", exact: true }),
  ).toBeVisible();
  for (const width of [1440, 390, 720]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(
      page.getByRole("button", {
        name: "Evidence is insufficient",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/experience-${width}.png`,
      fullPage: true,
    });
  }
  const display = await page.context().newCDPSession(page);
  await display.send("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 500,
    deviceScaleFactor: 2,
    mobile: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Evidence is insufficient", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Follow the evidence once more." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/experience-zoom-200.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("a lost reveal response retries the same committed guess", async ({
  page,
}) => {
  await loadAct(page);
  await loadAct(page, "Act II: Blind issuance");
  await page
    .getByRole("button", { name: "Evidence is insufficient", exact: true })
    .click();
  await page.route(
    "**/reveal",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Your submitted guess is retained",
  );
  await expect(
    page.getByRole("button", { name: "Evidence is insufficient", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry same guess", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The evidence has a limit." }),
  ).toBeVisible();
});

test("correct but unjustified guesses are presented as luck, never as attribution", async ({
  page,
}) => {
  await loadAct(page);
  const evidence = await loadAct(page, "Act II: Blind issuance");
  const source = evidence.issuances[0]!.eventId;
  await page.route("**/reveal", (route) =>
    route.fulfill({
      json: {
        verdict: {
          correct: true,
          evidenceSupported: false,
          candidateCount: 12,
          sourceEventId: source,
          explanation:
            "The guess matches the controlled answer, but these observations do not establish a unique source.",
        },
        groundTruth: { label: "GROUND TRUTH", sourceEventId: source },
      },
    }),
  );
  await page.getByRole("button", { name: /^Inspect issuance 1:/ }).click();
  await page
    .getByRole("button", { name: "Choose this issuance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A lucky guess is still a guess." }),
  ).toBeVisible();
  await expect(
    page.getByText("12 compatible issuance events", { exact: true }),
  ).toBeVisible();
});

test("inconsistent or overfull reveal responses fail closed", async ({
  page,
}) => {
  await loadAct(page);
  const evidence = await loadAct(page, "Act II: Blind issuance");
  await page
    .getByRole("button", { name: "Evidence is insufficient", exact: true })
    .click();
  await page.route("**/reveal", (route) =>
    route.fulfill({
      json: {
        verdict: {
          correct: true,
          evidenceSupported: true,
          candidateCount: 1,
          sourceEventId: evidence.issuances[0]!.eventId,
          explanation: "An inconsistent server response.",
        },
        groundTruth: {
          label: "GROUND TRUTH",
          sourceEventId: evidence.issuances[0]!.eventId,
        },
        answerKey: { unexpected: true },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("invalid result");
  await expect(
    page.getByRole("heading", { name: "The evidence has a limit." }),
  ).toHaveCount(0);
});

test("recorded Cashu playback preserves provenance and supports both captured acts", async ({
  page,
}) => {
  await loadAct(page);
  await loadAct(page, "Act II: Blind issuance");
  await expect(page.getByLabel("Data source", { exact: true })).toBeVisible();
  const captureResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/recorded-runs") && r.status() === 201,
  );
  await page
    .getByLabel("Data source", { exact: true })
    .selectOption("recorded-cashu");
  const payload = await (await captureResponse).json();
  expect(payload.evidence.mode).toBe("recorded-cashu");
  expect(payload.evidence.schemaVersion).toBe(2);
  expect(JSON.stringify(payload)).not.toMatch(
    /sourceEventId|answerKey|targetIndex|secret|mnemonic/,
  );
  await expect(
    page.getByText("RECORDED CASHU RUN", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Evidence is insufficient", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(
    page.getByText("12 compatible issuance events", { exact: true }),
  ).toBeVisible();
  await page.locator("#method > summary").click();
  await expect(
    page.getByText("Nutshell 0.20.2 · FakeWallet", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/recorded-cashu-desktop.png",
    fullPage: true,
  });
  const rareResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/recorded-runs") && r.status() === 201,
  );
  await page
    .getByRole("button", { name: "Act III: The metadata clue", exact: true })
    .click();
  const rare = (await (await rareResponse).json()).evidence;
  const index = rare.issuances.findIndex(
    (item: { amountSat: number }) => item.amountSat === 64,
  );
  await page
    .getByRole("button", {
      name: new RegExp(`^Inspect issuance ${index + 1}:`),
    })
    .click();
  await page
    .getByRole("button", { name: "Choose this issuance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reveal result", exact: true })
    .click();
  await expect(
    page.getByText("1 compatible issuance event", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/recorded-cashu-mobile.png",
    fullPage: true,
  });
});

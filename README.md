# Playwright Test Agent

A modular Playwright automation framework that runs structured test suites, generates an HTML report with pass/fail filtering, and posts results to a Google Chat space via webhook.

---

## Project Structure

```
playwright-agent/
├── src/
│   ├── index.ts          # Entry point — runs all suites in order
│   ├── config.ts         # ✏️  Environment config (URL, credentials, headless, webhook)
│   ├── test-plan.ts      # ✏️  Test metadata (labels, types, descriptions)
│   ├── tests.ts          # ✏️  Actual test suite functions
│   ├── types.ts          # Shared TypeScript types
│   ├── state.ts          # Shared state + report/startSuite helpers
│   └── reporter.ts       # HTML report generator + Google Chat sender
├── reports/
│   └── report.html       # Generated after each run
└── README.md
```

### What to change vs. what to leave alone

| File | When to change |
|---|---|
| `config.ts` | Switching environments, credentials, or webhook URL |
| `test-plan.ts` | Adding, removing, or updating test descriptions |
| `tests.ts` | Adding or modifying test logic |
| `index.ts` | Adding a new suite to the run order |
| `types.ts` | Never (unless extending the data model) |
| `state.ts` | Never (shared infrastructure) |
| `reporter.ts` | Never (HTML/GChat reporting infrastructure) |

---

## Prerequisites

- Node.js 18+
- Playwright browsers installed

```bash
npm install
npx playwright install chromium
```

---

## Running Tests

```bash
npx ts-node src/index.ts
```

With Google Chat reporting:

```bash
GCHAT_WEBHOOK="https://chat.googleapis.com/v1/spaces/..." npx ts-node src/index.ts
```

To avoid setting the webhook every time, add it to your shell profile:

```bash
echo 'export GCHAT_WEBHOOK="<your-webhook-url>"' >> ~/.zshrc
source ~/.zshrc
```

---

## Configuration — `src/config.ts`

All environment-specific values live here. Change this file when switching projects or environments.

```ts
export const config = {
  baseUrl:      "https://the-internet.herokuapp.com",  // target app URL
  username:     "tomsmith",                            // login username
  password:     "SuperSecretPassword!",                // login password
  headless:     false,                                 // true = no browser window
  reportsDir:   "reports",                             // where report.html is saved
  gchatWebhook: process.env.GCHAT_WEBHOOK ?? "",       // Google Chat webhook URL
};
```

---

## Test Plan — `src/test-plan.ts`

Defines the metadata for every check: its label, type, and a plain-English description of what it verifies. This is printed to the console before execution and appears in the HTML report and Google Chat card.

### Check types

| Type | Symbol | Meaning |
|---|---|---|
| `positive` | `[+]` | Happy path — the feature works as expected |
| `negative` | `[-]` | Failure path — invalid input is rejected |
| `edge` | `[~]` | Boundary or unusual input that needs special handling |

### Example entry

```ts
"Valid Login & Logout": [
  {
    label:       "Login redirects to /secure",
    type:        "positive",
    description: "Valid credentials should land on the secure page",
  },
  ...
]
```

### Adding a new suite to the plan

Add a new key to `TEST_PLAN` with the same name you'll pass to `startSuite()` in `tests.ts`:

```ts
"My New Suite": [
  { label: "Something works",    type: "positive", description: "It should do X" },
  { label: "Something is blocked", type: "negative", description: "It should reject Y" },
],
```

---

## Tests — `src/tests.ts`

Each test suite is an `async function` that receives a Playwright `Page`. Use `startSuite()` to register the suite and `report()` to record each check.

### `startSuite(name)`

Registers a new suite. The `name` must exactly match the key in `TEST_PLAN`.

```ts
startSuite("My New Suite");
```

### `report(label, type, passed, detail?)`

Records a single check result.

| Param | Type | Description |
|---|---|---|
| `label` | `string` | Must match the label in `TEST_PLAN` |
| `type` | `"positive" \| "negative" \| "edge"` | Check category |
| `passed` | `boolean` | Whether the check passed |
| `detail` | `string` (optional) | Extra info shown in the report (e.g. `"2/3 broken"`) |

### Example suite

```ts
export async function testMyFeature(page: Page) {
  startSuite("My New Suite");
  await page.goto(`${config.baseUrl}/my-page`);

  const heading = await page.locator("h1").textContent();
  report("Page heading is visible", "positive", !!heading);

  await page.fill("#search", "");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".error");
  report("Empty search shows error", "negative", true);
}
```

---

## Adding a New Suite — End to End

**1. Add metadata to `test-plan.ts`:**
```ts
"Search": [
  { label: "Search returns results",   type: "positive", description: "A valid query should return at least one result" },
  { label: "Empty search shows error", type: "negative", description: "Submitting blank search should show a validation error" },
],
```

**2. Write the function in `tests.ts`:**
```ts
export async function testSearch(page: Page) {
  startSuite("Search");
  await page.goto(`${config.baseUrl}/search`);

  await page.fill("#query", "playwright");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".results");
  report("Search returns results", "positive", (await page.locator(".result-item").count()) > 0);

  await page.fill("#query", "");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".error");
  report("Empty search shows error", "negative", true);
}
```

**3. Register it in `index.ts`:**
```ts
import { testSearch } from "./tests";

// inside run():
await testSearch(page);
```

That's it — the suite will appear in the console output, HTML report, and Google Chat card automatically.

---

## HTML Report — `reports/report.html`

Generated after every run. Open it with:

```bash
open reports/report.html
```

### Features

- **Overall status badge** — PASSED / FAILED
- **Summary cards** — passed, failed, total, pass rate
- **Filter bar** — click `Positive`, `Negative`, or `Edge` to show only those checks across all suites; click `All` to reset
- **Collapsible suites** — click a suite header to expand or collapse its checks
- **Per-check detail** — label, description, type badge, and PASS/FAIL result

---

## Google Chat Report

When `GCHAT_WEBHOOK` is set, a formatted card is posted to your Google Chat space after every run.

### Card contents

- Header with overall status and check/suite counts
- Summary row: passed / failed / total / pass rate
- Type breakdown: `[+]` positive / `[-]` negative / `[~]` edge counts
- One collapsible section per suite showing each check with its type and result

### Setting up a webhook

1. Open Google Chat → go to your space → click the space name at the top
2. Click **Apps & Integrations** → **Add webhooks**
3. Name it (e.g. `Playwright Bot`) and click **Save**
4. Copy the URL and export it:

```bash
export GCHAT_WEBHOOK="https://chat.googleapis.com/v1/spaces/XXXXX/messages?key=...&token=..."
```

---

## Current Test Suites

| # | Suite | Checks | Positive | Negative | Edge |
|---|---|---|---|---|---|
| 1 | Valid Login & Logout | 4 | 4 | 0 | 0 |
| 2 | Invalid Login Attempts | 3 | 0 | 2 | 1 |
| 3 | Checkboxes | 3 | 2 | 1 | 0 |
| 4 | Dropdown | 2 | 2 | 0 | 0 |
| 5 | JavaScript Alerts | 4 | 2 | 1 | 1 |
| 6 | Add / Remove Elements | 2 | 1 | 1 | 0 |
| 7 | Hovers | 4 | 4 | 0 | 0 |
| 8 | Dynamic Loading | 1 | 0 | 0 | 1 |
| 9 | Broken Images | 1 | 0 | 0 | 1 |
| 10 | Key Presses | 2 | 1 | 0 | 1 |
| **Total** | | **26** | **16** | **5** | **5** |

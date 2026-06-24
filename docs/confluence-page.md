# Playwright Test Agent — Project Wiki

**Owner:** Neha Nivalkar
**Stack:** TypeScript · Playwright · Node.js
**Target App:** [The Internet (Herokuapp)](https://the-internet.herokuapp.com)
**Reporting:** HTML Report · Google Chat Webhook

---

## Overview

Playwright Test Agent is a modular browser automation framework built with Playwright and TypeScript. It runs structured test suites against a web application, categorises every check as **positive**, **negative**, or **edge**, generates a filterable HTML report, and posts a rich summary card to a Google Chat space after every run.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        index.ts                         │
│              (Entry point / Orchestrator)               │
└────────┬───────────────────────────────────┬────────────┘
         │                                   │
         ▼                                   ▼
  ┌─────────────┐                   ┌──────────────────┐
  │ test-plan.ts│                   │    config.ts     │
  │  (metadata) │                   │  (env settings)  │
  └──────┬──────┘                   └────────┬─────────┘
         │                                   │
         ▼                                   ▼
  ┌─────────────────────────────────────────────────────┐
  │                      tests.ts                       │
  │            (Playwright test suite functions)        │
  └──────────────────────────┬──────────────────────────┘
                             │  report() / startSuite()
                             ▼
                    ┌─────────────────┐
                    │    state.ts     │
                    │ (live results)  │
                    └────────┬────────┘
                             │
                   ┌─────────┴──────────┐
                   ▼                    ▼
          ┌──────────────┐    ┌──────────────────┐
          │ report.html  │    │  Google Chat card │
          │ (reporter.ts)│    │  (reporter.ts)   │
          └──────────────┘    └──────────────────┘
```

---

## Project Structure

```
playwright-agent/
├── src/
│   ├── index.ts        → Entry point. Launches browser, runs all suites, saves reports
│   ├── config.ts       → Base URL, credentials, headless mode, webhook URL
│   ├── test-plan.ts    → Metadata for every check (label, type, description)
│   ├── tests.ts        → Playwright test suite functions
│   ├── types.ts        → Shared TypeScript interfaces
│   ├── state.ts        → Shared mutable state + report/startSuite helpers
│   └── reporter.ts     → HTML report generator + Google Chat card sender
├── reports/
│   └── report.html     → Auto-generated after every run
├── docs/
│   └── confluence-page.md
└── README.md
```

---

## File Responsibilities

| File | Responsibility | Change when… |
|---|---|---|
| `index.ts` | Wires everything together; runs suites in order | Adding a new suite to the run |
| `config.ts` | All environment-specific values | Switching environments or credentials |
| `test-plan.ts` | Check metadata — labels, types, descriptions | Adding/modifying test descriptions |
| `tests.ts` | Browser automation logic | Adding/modifying test steps |
| `types.ts` | TypeScript types shared across all files | Extending the data model |
| `state.ts` | Accumulates results as tests run | Never |
| `reporter.ts` | Generates HTML report and Google Chat card | Never |

---

## Setup & Installation

### Prerequisites

- Node.js 18 or higher
- npm

### Install dependencies

```bash
npm install
npx playwright install chromium
```

### Set Google Chat webhook (one-time)

```bash
echo 'export GCHAT_WEBHOOK="https://chat.googleapis.com/v1/spaces/YOUR_SPACE/messages?key=...&token=..."' >> ~/.zshrc
source ~/.zshrc
```

---

## Running the Tests

```bash
npx ts-node src/index.ts
```

The run will:
1. Print the full test plan to the console
2. Open a Chromium browser and execute all 10 suites
3. Save `reports/report.html`
4. Post a summary card to Google Chat (if webhook is set)

---

## Test Categories

Every check is assigned one of three types:

| Type | Symbol | Description |
|---|---|---|
| **Positive** | `[+]` | Happy path — verifies the feature works correctly with valid input |
| **Negative** | `[-]` | Failure path — verifies the app rejects invalid or incorrect input |
| **Edge** | `[~]` | Boundary case — verifies unusual, empty, or unexpected input is handled |

---

## Current Test Suites

| # | Suite | Total | `[+]` | `[-]` | `[~]` |
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

---

## HTML Report

The HTML report is saved to `reports/report.html` after every run and can be opened in any browser.

```bash
open reports/report.html
```

### Report Features

| Feature | Description |
|---|---|
| Overall badge | Shows PASSED (green) or FAILED (red) |
| Summary cards | Passed, Failed, Total, Pass Rate |
| Filter buttons | Filter all checks by Positive / Negative / Edge type |
| Collapsible suites | Click a suite header to expand or collapse its checks |
| Check detail | Each row shows the label, description, type badge, and result |

---

## Google Chat Report

After every run, a `cardsV2` card is posted to the configured Google Chat space.

### Card Structure

```
┌─────────────────────────────────────────────┐
│ 🎭 Playwright Test Report                   │
│ ✅ ALL PASSED • 26 checks • 10 suites        │
├─────────────────────────────────────────────┤
│ ✅ ALL PASSED          Jun 12, 2026          │
│ ✅ Passed: 26  ❌ Failed: 0  Total: 26       │
│ 🎯 Pass Rate: 100%                          │
│ [+] Positive: 16 • [-] Negative: 5 • [~] Edge: 5 │
├─────────────────────────────────────────────┤
│ ▼ ✅ Valid Login & Logout  4/4              │
│   ✅ [+] Login redirects to /secure         │
│   ✅ [+] Login success flash shown          │
│   ... (collapsible)                         │
├─────────────────────────────────────────────┤
│   ... (one section per suite)               │
└─────────────────────────────────────────────┘
```

### Setting Up a New Webhook

1. Open Google Chat and go to your space
2. Click the space name → **Apps & Integrations** → **Add webhooks**
3. Name it (e.g. `Playwright Bot`) and click **Save**
4. Copy the URL — it looks like:
   `https://chat.googleapis.com/v1/spaces/XXXXX/messages?key=...&token=...`
5. Export it as an environment variable (see Setup section above)

---

## Adding a New Test Suite

Follow these 3 steps every time you want to add a new suite.

### Step 1 — Add metadata to `src/test-plan.ts`

```ts
"My Feature": [
  { label: "Feature loads correctly",  type: "positive", description: "Page should render with all elements visible" },
  { label: "Invalid input is rejected", type: "negative", description: "Submitting bad data should show an error" },
  { label: "Empty form is blocked",     type: "edge",     description: "Submitting blank form should not proceed" },
],
```

### Step 2 — Write the test function in `src/tests.ts`

```ts
export async function testMyFeature(page: Page) {
  startSuite("My Feature");
  await page.goto(`${config.baseUrl}/my-feature`);

  await page.waitForSelector("h1");
  report("Feature loads correctly", "positive", await page.locator("h1").isVisible());

  await page.fill("#input", "bad-data");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".error");
  report("Invalid input is rejected", "negative", true);

  await page.fill("#input", "");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".error");
  report("Empty form is blocked", "edge", true);
}
```

### Step 3 — Register it in `src/index.ts`

```ts
import { testMyFeature } from "./tests";

// inside run():
await testMyFeature(page);
```

The new suite will automatically appear in the console plan, HTML report, and Google Chat card.

---

## Key APIs

### `startSuite(name: string)`
Registers a new suite. The name must exactly match the key in `TEST_PLAN`.

### `report(label, type, passed, detail?)`

| Parameter | Type | Description |
|---|---|---|
| `label` | `string` | Check label — must match `TEST_PLAN` |
| `type` | `"positive" \| "negative" \| "edge"` | Check category |
| `passed` | `boolean` | `true` = PASS, `false` = FAIL |
| `detail` | `string` (optional) | Extra context shown in the report |

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `GCHAT_WEBHOOK not set` | Env variable missing | Run `source ~/.zshrc` or prefix the command with `GCHAT_WEBHOOK=...` |
| Timeout on Dynamic Loading | Heroku app is slow | Re-run the tests — this is intermittent |
| `Cannot find module` error | Wrong entry point | Always run via `npx ts-node src/index.ts` |
| Browser not launching | Playwright not installed | Run `npx playwright install chromium` |

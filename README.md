# Playwright Agent — Agentic AI Test Automation

An agentic AI test automation system built with Playwright. Instead of fixed click-by-click scripts, the agent **observes** the current page state, **thinks** about what to do next, and **acts** — looping until the goal is complete. Results are saved as JSON history, visualised in a two-tab dashboard (Today + Weekly), and posted to Google Chat after every run.

---

## What makes this "Agentic AI"

| Traditional automation | This project |
|---|---|
| Fixed script: step 1 → step 2 → step 3 | Goal-driven: *"log in and check all checkboxes"* |
| Breaks if page structure changes | Adapts by re-reading page state every step |
| You write every click | Agent decides what to click based on context |
| No memory between steps | Tracks a `done[]` list to avoid repeating actions |

The agent runs a **3-step loop**:

```
OBSERVE  →  THINK  →  ACT  →  (repeat until done)
```

- **OBSERVE** — scans the live browser page and returns a structured snapshot (URL, inputs, buttons, flash messages)
- **THINK** — given the goal and what's been done so far, decides the single best next action
- **ACT** — executes that action on the real browser (navigate, fill, click, hover, select...)

This is the same pattern used by AI browser agents (AutoGPT, Claude Computer Use) — built here from scratch using Playwright as the "hands."

---

## Project Structure

```
playwright-agent/
│
├── src/
│   ├── agent.ts          ← THE AGENT — observe → think → act loop
│   ├── index.ts          ← Main runner — orchestrates all 10 test suites
│   ├── tests.ts          ← Individual test suite implementations
│   ├── test-plan.ts      ← Test metadata (labels, types, descriptions)
│   ├── reporter.ts       ← Saves HTML report, JSON history, Google Chat card
│   ├── state.ts          ← In-memory pass/fail tracker during a run
│   ├── config.ts         ← URL, credentials, settings
│   └── types.ts          ← TypeScript type definitions
│
├── scripts/
│   └── generate-dashboard.js   ← Reads JSON history → builds dashboard HTML
│
├── tests/
│   └── login.spec.ts           ← Standard Playwright test file
│
├── reports/
│   ├── history/                ← One JSON file per run (gitignored, lives on gh-pages)
│   ├── report.html             ← Latest single-run HTML report
│   └── dashboard.html          ← Full dashboard (generated, not committed)
│
├── .github/
│   └── workflows/
│       └── playwright-report.yml   ← GitHub Actions CI/CD pipeline
│
├── .claude/
│   └── commands/
│       └── run-playwright.md       ← Claude Code skill (slash command)
│
├── package.json
├── playwright.config.ts
└── .gitignore
```

---

## The Agent — `src/agent.ts`

The core agentic piece. Runs the observe → think → act loop for any goal expressed in plain English.

### How it works

```typescript
// 1. OBSERVE — read the live page
const pageState = await observe(page);
// Returns: { url, inputs, buttons, flashMsg, ... }

// 2. THINK — decide the next action
const action = think(goal, pageState, done);
// Returns: { type: "click", selector: 'button[type="submit"]', description: "Submit login form" }

// 3. ACT — execute it
await act(page, action);

// Repeat until action.type === "done"
```

### Running the agent

```bash
npx ts-node src/agent.ts
```

The agent navigates to the target site, logs in, checks checkboxes, selects a dropdown option, and logs out — all driven by a single goal string, no hardcoded selectors in the loop.

---

## The Main Runner — `src/index.ts`

Runs 10 structured test suites in sequence using explicit Playwright actions. Each suite calls `report()` to record checks, then saves results as HTML + JSON and sends a Google Chat notification.

```bash
npm start
```

### Test suites

| # | Suite | Checks | Types |
|---|---|---|---|
| 1 | Valid Login & Logout | 4 | positive |
| 2 | Invalid Login Attempts | 3 | negative, edge |
| 3 | Checkboxes | 3 | positive, negative |
| 4 | Dropdown | 2 | positive |
| 5 | JavaScript Alerts | 4 | positive, negative, edge |
| 6 | Add / Remove Elements | 2 | positive, negative |
| 7 | Hovers | 4 | positive |
| 8 | Dynamic Loading | 1 | edge |
| 9 | Broken Images | 1 | edge |
| 10 | Key Presses | 2 | positive, edge |
| **Total** | | **26** | |

### Check types

| Type | Symbol | Meaning |
|---|---|---|
| `positive` | `[+]` | Happy path — the feature works as expected |
| `negative` | `[-]` | Failure path — invalid input is rejected |
| `edge` | `[~]` | Boundary case or unusual input |

---

## The Dashboard

After every run, results are saved as a timestamped JSON file in `reports/history/`. The dashboard generator reads all history files and produces a self-contained HTML report with two tabs.

### Today tab
- Giant pass rate percentage (counts up on load)
- Passed / Failed / Total / Suites stat chips
- Filter bar: All / Positive / Negative / Edge
- Expandable suite accordion — failing suites auto-open
- `≈ flaky` badge on any check that has failed in this session but passed before

### Weekly tab
- Stats: runs this week, avg pass rate, best run, most failures, flaky suite count
- **Flaky Alerts section** — lists suites with intermittent failures, shows their run-by-run pattern (✓ ✗ ✓ ✗), failure rate, and trend (stabilising ↑ / recently failing / intermittent)
- **Pass rate trend chart** — animated bar chart, last 20 runs, colour-coded by health
- **Suite failure heatmap** — grid of coloured cells, one per suite per run; cells fade in on load

### Flaky test detection

A test is **flaky** if it has passed in some runs and failed in others within the same week — not consistently broken, but unreliable. The dashboard distinguishes:

- 🔴 All fails → **broken** — something is definitely wrong
- 🟠 Mix of pass/fail → **flaky** — intermittent, harder to debug
- 🟢 All pass → **stable**

### Running locally

```bash
npm start            # run tests + save JSON
npm run dashboard    # regenerate dashboard from history
npm run report       # both together
open reports/dashboard.html
```

---

## The Skill — `.claude/commands/run-playwright.md`

A **Claude Code skill** is a markdown file that teaches Claude how to perform a specific task. When you type `/run-playwright` in Claude Code, it reads this file and follows the instructions automatically — runs the tests, waits for completion, and reports results.

```markdown
---
description: Run Playwright login/logout automation without an API key
---

Run the Playwright test suite.
1. Use the Bash tool to run: npx ts-node src/index.ts
2. Wait for it to complete
3. Report the output — suite results, pass/fail counts, and any errors
```

Skills live in `.claude/commands/` — create as many as you want for any repeating task.

---

## Reporting pipeline

```
npm start
    │
    ├── Runs all 10 test suites
    ├── state.ts tracks pass/fail in memory
    └── reporter.ts saves:
          ├── reports/report.html              ← single-run HTML report
          ├── reports/history/TIMESTAMP.json   ← permanent record
          └── Google Chat card (if webhook set)

npm run dashboard
    │
    └── scripts/generate-dashboard.js
          reads all history JSONs
          detects flaky suites & checks
          generates reports/dashboard.html
```

---

## GitHub Actions — CI/CD

The workflow in `.github/workflows/playwright-report.yml` runs automatically on every push to `main` and on a weekday schedule (Mon–Fri 9 AM UTC).

### What it does

1. Checks out the source code
2. Restores previous history from the `gh-pages` branch
3. Installs dependencies and Playwright browsers
4. Runs the full test suite
5. Copies the new JSON result into the history
6. Generates the dashboard
7. Pushes everything to the `gh-pages` branch

### GitHub Pages

Once the `gh-pages` branch exists, enable Pages in **Settings → Pages → Branch: gh-pages** and the dashboard will be live at:

```
https://nehanivalkar.github.io/playwright-agent/
```

### Secrets

| Secret | Purpose |
|---|---|
| `GCHAT_WEBHOOK` | Google Chat webhook URL for notifications (optional) |

---

## Setup

```bash
npm install
npx playwright install chromium
```

### Run tests

```bash
npm start
```

### Run with Google Chat notifications

```bash
GCHAT_WEBHOOK="https://chat.googleapis.com/v1/spaces/..." npm start
```

### Add to shell profile to avoid setting every time

```bash
echo 'export GCHAT_WEBHOOK="<your-webhook-url>"' >> ~/.zshrc
source ~/.zshrc
```

---

## Adding a new test suite

**1. Add metadata to `src/test-plan.ts`:**
```typescript
"Search": [
  { label: "Search returns results",   type: "positive", description: "A valid query returns at least one result" },
  { label: "Empty search shows error", type: "negative", description: "Blank search shows a validation error" },
],
```

**2. Write the function in `src/tests.ts`:**
```typescript
export async function testSearch(page: Page) {
  startSuite("Search");
  await page.goto(`${BASE}/search`);

  await page.fill("#query", "playwright");
  await page.click('button[type="submit"]');
  report("Search returns results", "positive",
    (await page.locator(".result-item").count()) > 0);

  await page.fill("#query", "");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".error");
  report("Empty search shows error", "negative", true);
}
```

**3. Register it in `src/index.ts`:**
```typescript
import { testSearch } from "./tests";
// inside run():
await testSearch(page);
```

The suite will automatically appear in the console output, HTML report, Google Chat card, and dashboard.

---

## What to change vs. what to leave alone

| File | When to change |
|---|---|
| `config.ts` | Switching target URL, credentials, or webhook |
| `test-plan.ts` | Adding or updating test descriptions |
| `tests.ts` | Adding or modifying test logic |
| `index.ts` | Adding a new suite to the run order |
| `scripts/generate-dashboard.js` | Changing dashboard layout or detection logic |
| `state.ts` | Never |
| `types.ts` | Never unless extending the data model |

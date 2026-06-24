import { chromium, Browser, Page } from "playwright";
import { config } from "./config";
import { startSuite, report } from "./state";
import { saveHtmlReport, sendGChatReport } from "./reporter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageState {
  url:     string;
  title:   string;
  text:    string;
  inputs:  Array<{ selector: string; type: string; id: string; placeholder: string }>;
  buttons: Array<{ selector: string; label: string }>;
  links:   Array<{ selector: string; label: string; href: string }>;
  checkboxes: Array<{ selector: string; checked: boolean; index: number }>;
  selects:    Array<{ selector: string; id: string; options: string[] }>;
  flashMsg:   string | null;
}

interface Action {
  type:        "navigate" | "fill" | "click" | "check" | "uncheck" | "select" | "hover" | "done";
  description: string;
  selector?:   string;
  value?:      string;
  url?:        string;
}

// ─── Observe — read the current page state ───────────────────────────────────

async function observe(page: Page): Promise<PageState> {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input:not([type=submit]):not([type=button])"))
      .map((el, i) => ({
        selector:    el.id ? `#${el.id}` : `input:nth-of-type(${i + 1})`,
        type:        (el as HTMLInputElement).type || "text",
        id:          el.id,
        placeholder: (el as HTMLInputElement).placeholder || "",
      }));

    const buttons = Array.from(document.querySelectorAll("button, input[type=submit], input[type=button], a.button"))
      .map((el, i) => ({
        selector: el.id ? `#${el.id}` : `button:nth-of-type(${i + 1})`,
        label:    (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value || "",
      }));

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((el, i) => ({
        selector: el.id ? `#${el.id}` : `a:nth-of-type(${i + 1})`,
        label:    (el as HTMLElement).innerText?.trim() || "",
        href:     (el as HTMLAnchorElement).href || "",
      }));

    const checkboxes = Array.from(document.querySelectorAll("input[type=checkbox]"))
      .map((el, i) => ({
        selector: `input[type=checkbox]:nth-of-type(${i + 1})`,
        checked:  (el as HTMLInputElement).checked,
        index:    i,
      }));

    const selects = Array.from(document.querySelectorAll("select"))
      .map((el, i) => ({
        selector: el.id ? `#${el.id}` : `select:nth-of-type(${i + 1})`,
        id:       el.id,
        options:  Array.from((el as HTMLSelectElement).options).map((o) => o.value).filter(Boolean),
      }));

    const flash = document.querySelector(".flash") as HTMLElement | null;

    return {
      url:        window.location.href,
      title:      document.title,
      text:       document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1000),
      inputs,
      buttons,
      links,
      checkboxes,
      selects,
      flashMsg:   flash ? flash.innerText.trim() : null,
    };
  });
}

// ─── Think — decide the next action based on goal + page state ────────────────

function think(goal: string, state: PageState, done: string[]): Action {
  const g    = goal.toLowerCase();
  const url  = state.url.toLowerCase();
  const text = state.text.toLowerCase();

  // ── Goal: Login ──
  if (g.includes("log in") || g.includes("login")) {
    if (!done.includes("login")) {
      if (url.includes("/login") || state.inputs.some((i) => i.id === "username")) {
        const userInput = state.inputs.find((i) => i.id === "username" || i.type === "text");
        const passInput = state.inputs.find((i) => i.id === "password" || i.type === "password");

        if (userInput && passInput) {
          if (!done.includes("fill_username"))
            return { type: "fill", selector: "#username", value: config.username, description: "Fill username" };
          if (!done.includes("fill_password"))
            return { type: "fill", selector: "#password", value: config.password, description: "Fill password" };
          if (!done.includes("submit_login"))
            return { type: "click", selector: 'button[type="submit"]', description: "Submit login form" };
        } else {
          return { type: "navigate", url: `${config.baseUrl}/login`, description: "Go to login page" };
        }
      } else {
        return { type: "navigate", url: `${config.baseUrl}/login`, description: "Go to login page" };
      }
    }
  }

  // ── Confirm login success ──
  if ((g.includes("confirm") || g.includes("verify")) && g.includes("login")) {
    if (!done.includes("confirm_login")) {
      if (url.includes("/secure") || text.includes("secure area")) {
        return { type: "done", description: "✅ Login confirmed — on secure area page" };
      }
    }
  }

  // ── Goal: Checkboxes ──
  if (g.includes("checkbox")) {
    if (!done.includes("goto_checkboxes")) {
      return { type: "navigate", url: `${config.baseUrl}/checkboxes`, description: "Go to checkboxes page" };
    }
    if (url.includes("checkbox")) {
      for (const cb of state.checkboxes) {
        const doneKey = `check_checkbox_${cb.index}`;
        if (!done.includes(doneKey)) {
          return {
            type:        cb.checked ? "uncheck" : "check",
            selector:    `input[type=checkbox]:nth-of-type(${cb.index + 1})`,
            description: `${cb.checked ? "Uncheck" : "Check"} checkbox ${cb.index + 1}`,
          };
        }
      }
    }
  }

  // ── Goal: Dropdown ──
  if (g.includes("dropdown") || g.includes("option 2") || g.includes("select")) {
    if (!done.includes("goto_dropdown")) {
      return { type: "navigate", url: `${config.baseUrl}/dropdown`, description: "Go to dropdown page" };
    }
    if (url.includes("dropdown") && !done.includes("select_option2")) {
      const sel = state.selects[0];
      if (sel) {
        return {
          type:        "select",
          selector:    `#${sel.id}` || sel.selector,
          value:       "2",
          description: "Select Option 2 from dropdown",
        };
      }
    }
  }

  // ── Goal: Logout ──
  if (g.includes("log out") || g.includes("logout")) {
    if (!done.includes("logout")) {
      if (url.includes("/secure")) {
        return { type: "click", selector: "a[href='/logout']", description: "Click logout link" };
      } else if (done.includes("login")) {
        return { type: "navigate", url: `${config.baseUrl}/secure`, description: "Go to secure page to logout" };
      }
    }
    if (done.includes("logout") && (url.includes("/login") || text.includes("logged out"))) {
      return { type: "done", description: "✅ Logout confirmed — back on login page" };
    }
  }

  // ── Goal: Hovers ──
  if (g.includes("hover")) {
    if (!done.includes("goto_hovers")) {
      return { type: "navigate", url: `${config.baseUrl}/hovers`, description: "Go to hovers page" };
    }
    for (let i = 1; i <= 3; i++) {
      if (!done.includes(`hover_figure_${i}`)) {
        return { type: "hover", selector: `.figure:nth-child(${i})`, description: `Hover over figure ${i}` };
      }
    }
  }

  // ── Default: mark done if goal keywords are satisfied ──
  const allGoalsDone =
    (!g.includes("login")    || done.includes("login")) &&
    (!g.includes("checkbox") || done.includes(`check_checkbox_0`)) &&
    (!g.includes("dropdown") || done.includes("select_option2")) &&
    (!g.includes("logout")   || done.includes("logout"));

  if (allGoalsDone) {
    return { type: "done", description: "✅ All goals completed" };
  }

  return { type: "done", description: "⚠️  Could not determine next action — stopping" };
}

// ─── Act — execute an action on the page ─────────────────────────────────────

async function act(page: Page, action: Action): Promise<void> {
  switch (action.type) {
    case "navigate":
      await page.goto(action.url!, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      break;
    case "fill":
      await page.fill(action.selector!, action.value!);
      break;
    case "click":
      await page.click(action.selector!);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);
      break;
    case "check":
      await page.check(action.selector!);
      break;
    case "uncheck":
      await page.uncheck(action.selector!);
      break;
    case "select":
      await page.selectOption(action.selector!, action.value!);
      break;
    case "hover":
      await page.hover(action.selector!);
      await page.waitForTimeout(300);
      break;
  }
}

// ─── Update done list after action ───────────────────────────────────────────

function updateDone(action: Action, state: PageState, done: string[]): string[] {
  const url = state.url.toLowerCase();

  if (action.selector === "#username")           done.push("fill_username");
  if (action.selector === "#password")           done.push("fill_password");
  if (action.description.includes("Submit"))     done.push("submit_login");
  if (url.includes("/secure"))                   done.push("login");
  if (url.includes("/login") && done.includes("submit_login")) done.push("logout");
  if (action.description.includes("checkbox"))  done.push(`check_checkbox_${action.selector?.includes("1") ? "0" : "1"}`);
  if (action.description.includes("checkboxes page")) done.push("goto_checkboxes");
  if (action.description.includes("dropdown"))  done.push("goto_dropdown");
  if (action.description.includes("Option 2"))  done.push("select_option2");
  if (action.description.includes("logout"))    done.push("logout");
  if (action.description.includes("hovers"))    done.push("goto_hovers");
  for (let i = 1; i <= 3; i++) {
    if (action.description.includes(`figure ${i}`)) done.push(`hover_figure_${i}`);
  }

  return [...new Set(done)];
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

async function runAgent(page: Page, goal: string): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(" 🤖 LOCAL AGENT  (no API key · no model install)");
  console.log("═".repeat(60));
  console.log(` Goal: ${goal}`);
  console.log("═".repeat(60) + "\n");

  startSuite("Agent Run");

  const done: string[] = [];
  let step = 0;
  const MAX_STEPS = 20;

  while (step < MAX_STEPS) {
    // 1. OBSERVE — read the page
    const pageState = await observe(page);
    console.log(`📍 Page: ${pageState.url}`);
    if (pageState.flashMsg) console.log(`   Flash: ${pageState.flashMsg}`);

    // 2. THINK — decide next action
    const action = think(goal, pageState, done);
    console.log(`🧠 Think: ${action.description}`);

    // 3. DONE?
    if (action.type === "done") {
      console.log(`\n${"─".repeat(60)}`);
      console.log(` ${action.description}`);
      console.log(`${"─".repeat(60)}\n`);
      report(action.description, "positive", action.description.includes("✅"));
      break;
    }

    // 4. ACT — execute the action
    console.log(`⚡ Act:   ${action.type.toUpperCase()} → ${action.selector || action.url || action.value || ""}`);
    try {
      await act(page, action);
      report(action.description, "positive", true);
    } catch (err: any) {
      report(action.description, "positive", false);
      console.error(`❌ Action failed: ${err.message}`);
      break;
    }

    // 5. UPDATE — mark what's been done
    const updatedState = await observe(page);
    updateDone(action, updatedState, done).forEach((d) => {
      if (!done.includes(d)) done.push(d);
    });

    step++;
    console.log("");
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  let browser: Browser | null = null;
  const runAt = new Date().toLocaleString();

  try {
    browser = await chromium.launch({ headless: config.headless });
    const page = await browser.newPage();

    await runAgent(
      page,
      `Log in with username "${config.username}" and password "${config.password}". ` +
      `Check both checkboxes on the checkboxes page. ` +
      `Select Option 2 from the dropdown page. ` +
      `Then log out.`
    );

    await page.waitForTimeout(2000);
  } finally {
    if (browser) await browser.close();
    const reportPath = saveHtmlReport({}, runAt);
    await sendGChatReport(runAt, reportPath);
  }
}

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});

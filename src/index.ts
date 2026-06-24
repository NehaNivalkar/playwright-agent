import { chromium } from "playwright";
import { config } from "./config";
import { state } from "./state";
import { TEST_PLAN, printTestPlan } from "./test-plan";
import { saveHtmlReport, saveJsonResult, sendGChatReport } from "./reporter";
import {
  testValidLoginLogout,
  testInvalidLogin,
  testCheckboxes,
  testDropdown,
  testJsAlerts,
  testAddRemoveElements,
  testHovers,
  testDynamicLoading,
  testBrokenImages,
  testKeyPresses,
} from "./tests";

async function run() {
  printTestPlan();

  const browser = await chromium.launch({ headless: config.headless });
  const page    = await browser.newPage();
  const runAt   = new Date().toLocaleString();

  try {
    await testValidLoginLogout(page);
    await testInvalidLogin(page);
    await testCheckboxes(page);
    await testDropdown(page);
    await testJsAlerts(page);
    await testAddRemoveElements(page);
    await testHovers(page);
    await testDynamicLoading(page);
    await testBrokenImages(page);
    await testKeyPresses(page);
  } finally {
    await browser.close();

    console.log(`\n${"─".repeat(60)}`);
    console.log(`Results: ${state.passed} passed, ${state.failed} failed out of ${state.passed + state.failed} checks`);

    const reportPath = saveHtmlReport(TEST_PLAN, runAt);
    saveJsonResult(TEST_PLAN, runAt);
    await sendGChatReport(runAt, reportPath);

    if (state.failed > 0) process.exit(1);
  }
}

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});

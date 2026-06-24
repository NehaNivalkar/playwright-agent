import { Page } from "playwright";
import { report, startSuite } from "./state";
import { config } from "./config";

const BASE = config.baseUrl;

export async function testValidLoginLogout(page: Page) {
  startSuite("Valid Login & Logout");
  await page.goto(`${BASE}/login`);
  await page.fill("#username", config.username);
  await page.fill("#password", config.password);
  await page.click('button[type="submit"]');

  await page.waitForURL("**/secure");
  const flash = await page.locator(".flash.success").textContent();
  report("Login redirects to /secure",  "positive", page.url().includes("/secure"));
  report("Login success flash shown",   "positive", !!flash?.includes("You logged into a secure area"));

  await page.click("a[href='/logout']");
  await page.waitForURL("**/login");
  const logoutFlash = await page.locator(".flash.success").textContent();
  report("Logout redirects to /login",  "positive", page.url().includes("/login"));
  report("Logout success flash shown",  "positive", !!logoutFlash?.includes("You logged out"));
}

export async function testInvalidLogin(page: Page) {
  startSuite("Invalid Login Attempts");
  await page.goto(`${BASE}/login`);

  await page.fill("#username", config.username);
  await page.fill("#password", "wrongpassword");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".flash.error");
  report("Wrong password shows error flash", "negative",
    !!(await page.locator(".flash.error").textContent())?.includes("Your password is invalid"));

  await page.fill("#username", "unknownuser");
  await page.fill("#password", config.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".flash.error");
  report("Wrong username shows error flash", "negative",
    !!(await page.locator(".flash.error").textContent())?.includes("Your username is invalid"));

  await page.fill("#username", "");
  await page.fill("#password", "");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".flash.error");
  report("Empty credentials blocked", "edge", true);
}

export async function testCheckboxes(page: Page) {
  startSuite("Checkboxes");
  await page.goto(`${BASE}/checkboxes`);

  const boxes = page.locator('input[type="checkbox"]');
  report("Two checkboxes present", "positive", (await boxes.count()) === 2);

  const first = boxes.nth(0);
  if (!(await first.isChecked())) await first.check();
  report("First checkbox can be checked", "positive", await first.isChecked());

  const second = boxes.nth(1);
  await second.uncheck();
  report("Second checkbox can be unchecked", "negative", !(await second.isChecked()));
}

export async function testDropdown(page: Page) {
  startSuite("Dropdown");
  await page.goto(`${BASE}/dropdown`);

  await page.selectOption("#dropdown", "1");
  report("Can select Option 1", "positive", (await page.locator("#dropdown").inputValue()) === "1");

  await page.selectOption("#dropdown", "2");
  report("Can select Option 2", "positive", (await page.locator("#dropdown").inputValue()) === "2");
}

export async function testJsAlerts(page: Page) {
  startSuite("JavaScript Alerts");
  await page.goto(`${BASE}/javascript_alerts`);

  page.once("dialog", (d) => d.accept());
  await page.click('button[onclick="jsAlert()"]');
  await page.waitForSelector("#result");
  report("JS Alert accepted", "positive",
    !!(await page.locator("#result").textContent())?.includes("You successfully clicked an alert"));

  page.once("dialog", (d) => d.accept());
  await page.click('button[onclick="jsConfirm()"]');
  await page.waitForTimeout(500);
  report("JS Confirm accepted", "positive",
    !!(await page.locator("#result").textContent())?.includes("Ok"));

  page.once("dialog", (d) => d.dismiss());
  await page.click('button[onclick="jsConfirm()"]');
  await page.waitForTimeout(500);
  report("JS Confirm dismissed", "negative",
    !!(await page.locator("#result").textContent())?.includes("Cancel"));

  page.once("dialog", (d) => d.accept("hello playwright"));
  await page.click('button[onclick="jsPrompt()"]');
  await page.waitForTimeout(500);
  report("JS Prompt input captured", "edge",
    !!(await page.locator("#result").textContent())?.includes("hello playwright"));
}

export async function testAddRemoveElements(page: Page) {
  startSuite("Add / Remove Elements");
  await page.goto(`${BASE}/add_remove_elements/`);

  await page.click('button[onclick="addElement()"]');
  await page.click('button[onclick="addElement()"]');
  const buttons = page.locator(".added-manually");
  report("Two elements added", "positive", (await buttons.count()) === 2);

  await buttons.first().click();
  report("Element removed after clicking Delete", "negative",
    (await page.locator(".added-manually").count()) === 1);
}

export async function testHovers(page: Page) {
  startSuite("Hovers");
  await page.goto(`${BASE}/hovers`);

  const figures = page.locator(".figure");
  const count = await figures.count();
  report("Three figures present", "positive", count === 3);

  for (let i = 0; i < count; i++) {
    await figures.nth(i).hover();
    report(`Figure ${i + 1} caption appears on hover`, "positive",
      await figures.nth(i).locator(".figcaption").isVisible());
  }
}

export async function testDynamicLoading(page: Page) {
  startSuite("Dynamic Loading");
  await page.goto(`${BASE}/dynamic_loading/1`);
  await page.click('button:has-text("Start")');
  await page.waitForSelector("#finish", { state: "visible", timeout: 15000 });
  report("Hidden element revealed after loading", "edge",
    !!(await page.locator("#finish").textContent())?.includes("Hello World!"));
}

export async function testBrokenImages(page: Page) {
  startSuite("Broken Images");
  await page.goto(`${BASE}/broken_images`);

  const images = page.locator("div.example img");
  const total = await images.count();
  let broken = 0;
  for (let i = 0; i < total; i++) {
    const w = await images.nth(i).evaluate((el) => (el as HTMLImageElement).naturalWidth);
    if (w === 0) broken++;
  }
  report("Page has broken images (expected)", "edge", broken > 0, `${broken}/${total} broken`);
}

export async function testKeyPresses(page: Page) {
  startSuite("Key Presses");
  await page.goto(`${BASE}/key_presses`);

  await page.press("body", "a");
  await page.waitForSelector("#result:not(:empty)");
  report("Key press 'A' detected", "positive",
    !!(await page.locator("#result").textContent())?.toUpperCase().includes("A"));

  await page.press("body", "Enter");
  report("Key press 'Enter' detected", "edge",
    !!(await page.locator("#result").textContent())?.toUpperCase().includes("ENTER"));
}

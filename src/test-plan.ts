import { TestPlan, CheckType } from "./types";

export const TEST_PLAN: TestPlan = {
  "Valid Login & Logout": [
    { label: "Login redirects to /secure",           type: "positive", description: "Valid credentials should land on the secure page" },
    { label: "Login success flash shown",            type: "positive", description: "A success banner confirms the user is logged in" },
    { label: "Logout redirects to /login",           type: "positive", description: "Clicking logout should return to the login page" },
    { label: "Logout success flash shown",           type: "positive", description: "A success banner confirms the user is logged out" },
  ],
  "Invalid Login Attempts": [
    { label: "Wrong password shows error flash",     type: "negative", description: "Correct username but wrong password must be rejected" },
    { label: "Wrong username shows error flash",     type: "negative", description: "Unknown username must be rejected" },
    { label: "Empty credentials blocked",            type: "edge",     description: "Submitting a blank form should not authenticate" },
  ],
  "Checkboxes": [
    { label: "Two checkboxes present",               type: "positive", description: "Page should render exactly two checkbox inputs" },
    { label: "First checkbox can be checked",        type: "positive", description: "Checking an unchecked box should persist the state" },
    { label: "Second checkbox can be unchecked",     type: "negative", description: "Unchecking a checked box should persist the state" },
  ],
  "Dropdown": [
    { label: "Can select Option 1",                  type: "positive", description: "Selecting Option 1 updates the dropdown value" },
    { label: "Can select Option 2",                  type: "positive", description: "Selecting Option 2 updates the dropdown value" },
  ],
  "JavaScript Alerts": [
    { label: "JS Alert accepted",                    type: "positive", description: "Accepting a JS alert should record the result" },
    { label: "JS Confirm accepted",                  type: "positive", description: "Accepting a confirm dialog should record OK" },
    { label: "JS Confirm dismissed",                 type: "negative", description: "Dismissing a confirm dialog should record Cancel" },
    { label: "JS Prompt input captured",             type: "edge",     description: "Text entered in a prompt dialog should appear in the result" },
  ],
  "Add / Remove Elements": [
    { label: "Two elements added",                   type: "positive", description: "Clicking Add twice should show two Delete buttons" },
    { label: "Element removed after clicking Delete",type: "negative", description: "Clicking Delete should reduce the count by one" },
  ],
  "Hovers": [
    { label: "Three figures present",                type: "positive", description: "The hovers page should contain exactly three figures" },
    { label: "Figure 1 caption appears on hover",    type: "positive", description: "Hovering figure 1 should reveal its caption" },
    { label: "Figure 2 caption appears on hover",    type: "positive", description: "Hovering figure 2 should reveal its caption" },
    { label: "Figure 3 caption appears on hover",    type: "positive", description: "Hovering figure 3 should reveal its caption" },
  ],
  "Dynamic Loading": [
    { label: "Hidden element revealed after loading",type: "edge",     description: "After clicking Start, a hidden element must appear once the loader finishes" },
  ],
  "Broken Images": [
    { label: "Page has broken images (expected)",    type: "edge",     description: "The broken_images page intentionally serves images that fail to load" },
  ],
  "Key Presses": [
    { label: "Key press 'A' detected",               type: "positive", description: "Pressing A should display the key name on screen" },
    { label: "Key press 'Enter' detected",           type: "edge",     description: "Pressing Enter (non-printable) should still be captured and displayed" },
  ],
};

export function printTestPlan() {
  const typeLabel: Record<CheckType, string> = {
    positive: "[+] positive",
    negative: "[-] negative",
    edge:     "[~] edge    ",
  };
  console.log("═".repeat(60));
  console.log(" TEST PLAN");
  console.log("═".repeat(60));
  let n = 1;
  for (const [suite, cases] of Object.entries(TEST_PLAN)) {
    console.log(`\n  [${n++}] ${suite}`);
    for (const c of cases) {
      console.log(`       ${typeLabel[c.type]}  ${c.label}`);
      console.log(`                       → ${c.description}`);
    }
  }
  const total = Object.values(TEST_PLAN).reduce((s, cs) => s + cs.length, 0);
  console.log(`\n  Total checks planned: ${total}`);
  console.log("═".repeat(60));
  console.log("\n Starting execution...");
}

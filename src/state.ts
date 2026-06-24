import { CheckType, SuiteResult } from "./types";

export const state = {
  results:      [] as SuiteResult[],
  currentSuite: null as SuiteResult | null,
  passed:       0,
  failed:       0,
};

export function startSuite(name: string) {
  console.log(`\n[${state.results.length + 1}] ${name}`);
  state.currentSuite = { suite: name, checks: [] };
  state.results.push(state.currentSuite);
}

export function report(label: string, type: CheckType, success: boolean, detail?: string) {
  const badge = type === "positive" ? "[+]" : type === "negative" ? "[-]" : "[~]";
  const prefix = success ? "✅ PASS" : "❌ FAIL";
  console.log(`  ${prefix} ${badge}: ${label}${detail ? " — " + detail : ""}`);
  success ? state.passed++ : state.failed++;
  state.currentSuite?.checks.push({ label, type, passed: success, detail });
}

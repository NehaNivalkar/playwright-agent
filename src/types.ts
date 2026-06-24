export type CheckType = "positive" | "negative" | "edge";

export interface CheckResult {
  label: string;
  type: CheckType;
  passed: boolean;
  detail?: string;
}

export interface SuiteResult {
  suite: string;
  checks: CheckResult[];
}

export type TestPlan = Record<
  string,
  Array<{ label: string; type: CheckType; description: string }>
>;

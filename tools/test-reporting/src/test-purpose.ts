/**
 * Test-file purpose, read from the filename suffix.
 *
 * Purpose is a property of one file, never of a suite: an owner project's
 * `test` target runs executable specifications and ordinary tests side by
 * side, and reporting labels each file by what it is.
 */

export type TestPurpose = "specification" | "e2e" | "test";

export const TEST_PURPOSES: readonly TestPurpose[] = ["specification", "e2e", "test"];

const E2E_SUFFIXES = [".e2e.test.ts", ".windows.e2e.test.ts", ".keychain.e2e.test.ts"] as const;

export const isTestPurpose = (value: unknown): value is TestPurpose =>
  typeof value === "string" && TEST_PURPOSES.some((purpose) => purpose === value);

export const classifyTestPurpose = (filePath: string): TestPurpose => {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.endsWith(".spec.ts")) return "specification";
  if (E2E_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return "e2e";
  return "test";
};

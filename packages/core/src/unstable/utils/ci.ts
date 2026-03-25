/**
 * Detects CI environment via CI=true env var.
 */
export const isCI = (): boolean => process.env["CI"] === "true";

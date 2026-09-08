import type { InlineConfig } from "vitest/node";

/**
 * Shared test execution profile.
 *
 * Worker count cannot be one fixed number. CI runners are small and dedicated,
 * developer machines are large and shared, so a value that fits a hosted runner
 * throttles a workstation by the ratio between them. Measured on a 14-core host,
 * the specification suite took 3m58s at two workers and 1m31s at 50%; 50% and
 * unbounded tied on wall clock, so 50% is preferred for leaving the rest of the
 * machine to the developer.
 *
 * Vitest's experimental filesystem module cache clears its shared directory
 * concurrently with cold workers after lockfile changes. Keep it disabled so
 * a clean checkout has the same reliable execution path as a warm checkout.
 */
export const testExecution: Pick<InlineConfig, "experimental" | "maxWorkers"> = {
  experimental: { fsModuleCache: false },
  maxWorkers: process.env["CI"] ? 2 : "50%",
};

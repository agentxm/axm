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
 * Timeouts follow the same split. Hosted runners run several project suites
 * at once, and the workspace specifications that install and sync real
 * packages measured about four times slower there than on a workstation
 * (68 s against 16 s for the sync realization file), so the 5 s default left
 * no headroom once the workspace suite became three concurrent projects. The
 * workstation keeps the default so a slow test still surfaces locally.
 */
export const testExecution: Pick<InlineConfig, "maxWorkers" | "testTimeout" | "hookTimeout"> = {
  maxWorkers: process.env["CI"] ? 2 : "50%",
  testTimeout: process.env["CI"] ? 20_000 : 5_000,
  hookTimeout: process.env["CI"] ? 20_000 : 10_000,
};

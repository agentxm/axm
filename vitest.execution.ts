import type { InlineConfig } from "vitest/node";

/**
 * Shared test execution profile.
 *
 * The local Nx profile runs two projects concurrently. Budgeting 25% of cores
 * to each test pool leaves half the machine for imports, child processes and
 * interactive work. On a 16-core host, eight-worker pools repeatedly exceeded
 * the existing five-second timeout, including with serial Nx execution. Four
 * workers passed both heavy suites together (6,308 tests, one optional skip).
 * This trades single-suite speed for reliable complete verification; focused
 * experiments can still use Vitest's native --maxWorkers override. Small hosted
 * runners retain their measured two-worker profile.
 *
 * Timeouts follow the same split. Hosted runners run several project suites
 * at once, and the workspace specifications that install and sync real
 * packages measured about four times slower there than on a workstation
 * (68 s against 16 s for the sync realization file), so the 5 s default left
 * no headroom once the workspace suite became three concurrent projects. The
 * workstation keeps the default so a slow test still surfaces locally.
 */
export const testExecution: Pick<InlineConfig, "maxWorkers" | "testTimeout" | "hookTimeout"> = {
  maxWorkers: process.env["CI"] ? 2 : "25%",
  testTimeout: process.env["CI"] ? 20_000 : 5_000,
  hookTimeout: process.env["CI"] ? 20_000 : 10_000,
};

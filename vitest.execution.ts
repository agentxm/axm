import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
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
 * no headroom once the workspace suite became three concurrent projects. A
 * workstation running the complete CLI suite beside other work crossed the
 * 5 s default on a different handful of tests each run, so a red run said
 * nothing about the change under test. Both hosts therefore share the limit,
 * and a workstation reports any test slower than the old default instead of
 * failing it, so a slow test still surfaces locally.
 *
 * Tests name the temporary directories they create and compare them with the
 * paths the product reports, which are canonical. Where the host's temporary
 * directory is itself a symlink — macOS resolves `/var/folders` to
 * `/private/var/folders` — every such comparison fails, so each worker is
 * given the canonical directory.
 *
 * A workstation reruns the same suites all day, and re-transforming unchanged
 * modules was a third of a focused run, so it keeps transformed modules on
 * disk between runs. Vitest keys them by content and drops them when
 * dependencies are reinstalled. Hosted runners start cold and keep the default.
 */
export const testExecution: Pick<
  InlineConfig,
  "maxWorkers" | "testTimeout" | "hookTimeout" | "slowTestThreshold" | "env" | "fsModuleCache"
> = {
  maxWorkers: process.env["CI"] ? 2 : "25%",
  testTimeout: 20_000,
  hookTimeout: 20_000,
  slowTestThreshold: process.env["CI"] ? 20_000 : 5_000,
  env: { TMPDIR: realpathSync(tmpdir()) },
  fsModuleCache: !process.env["CI"],
};

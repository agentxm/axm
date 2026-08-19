---
id: 2026-08-19T122800Z-v6n2
subject: ci-cd-workflows
key: affected-gate-duplicate-compile-enospc
observed_at: "2026-08-19T12:28:00Z"
session: s8k2m4
kind: failure
status: open
---

**Expected:** The repository pre-commit affected gate would reuse or serialize the CLI binary compilation required by affected targets and finish within available workspace capacity.
**Observed:** `axm:verify-affected` started `cli:compile` twice during one affected run; after the first invocation generated all five binaries, the second failed with `No space left on device`, and concurrent TypeScript/Nx processes then failed while writing results.
**Impact:** The verified item commit was blocked after generation, lint, formatting, and several builds had passed; the gate had to be retried after reclaiming regenerable cache storage.
**Recovery:** Pending; clear only regenerable Nx cache artifacts, then rerun the gate with repository parallelism disabled.
**Detected by:** The pre-commit hook's `verify-affected` output and filesystem capacity readback.
**Observed factors:** The filesystem had 332 KiB free; `.nx/cache` occupied 11 GiB; `packages/cli/dist` occupied 433 MiB; the affected task graph printed two `nx run cli:compile` invocations.
**Hypothesis:** Multiple affected targets depend on the same uncached compile output without a single serialized artifact owner, allowing redundant large binary writes to exhaust the workspace.
**Suggests:** Make CLI binary compilation a shared single-owner dependency in the affected graph and add an early capacity diagnostic before large artifact builds.

Evidence: pre-commit exited 1; first compile produced five `0.27.9` binaries; second compile reported OS error 28; subsequent writes reported `ENOSPC`.

---
id: 2026-08-25T195637Z-b8k2
subject: ci-cd-workflows
key: e2e-orphaned-cli-cpu-loop
observed_at: "2026-08-25T19:56:37Z"
session: m4q8
kind: workaround
status: open
---

**Expected:** An interrupted or completed E2E run should not leave a spawned AXM CLI process consuming host resources after its test workspace and parent process are gone.
**Observed:** `packs list --scope project --json` remained orphaned under PID 1 in an E2E temporary workspace for more than 11 hours while continuously consuming about 100% of one CPU core.
**Impact:** Subsequent full E2E release gates experienced multi-minute CLI subprocess delays while the orphan competed for host capacity.
**Recovery:** Confirm the process belonged to an `axm-e2e-*` temporary workspace with detached standard streams, send `SIGTERM`, then send `SIGKILL` to the exact PID after it ignored graceful termination.
**Detected by:** Host-load and process-tree inspection after two release-preparation E2E runs progressed far more slowly than the earlier full CI run.
**Observed factors:** PID 74181 had parent PID 1, command `bun run .../packages/cli/dist/src/main.js packs list --scope project --json`, temporary working directory `axm-e2e-5yQ9e4`, detached standard streams, elapsed runtime 11 hours 19 minutes, and approximately 100% CPU use.
**Diagnostic evidence:** Exact process PID 74181; initial `SIGTERM` did not stop the process; exact-PID `SIGKILL` removed it; no request or correlation ID was supplied.
**Hypothesis:** A prior interrupted E2E parent exited without reaping or terminating its spawned Bun CLI process, which then remained in a CPU loop.
**Suggests:** Ensure the E2E runner terminates the spawned process group when its parent exits or is interrupted, and cover cleanup with a process-lifecycle test.

Evidence: `ps` and `lsof` showed the orphaned parent relationship, exact AXM command, E2E temporary working directory, detached streams, elapsed runtime, and sustained CPU use; exact-PID termination restored the process table.

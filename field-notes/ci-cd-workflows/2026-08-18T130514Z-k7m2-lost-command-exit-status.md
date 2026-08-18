---
id: 2026-08-18T130514Z-k7m2
subject: ci-cd-workflows
key: lost-command-exit-status
observed_at: "2026-08-18T13:05:14Z"
session: exec-47571
kind: workaround
status: open
---

**Expected:** The long-running `pnpm run ci:affected` session would retain its
final output and exit status for polling.
**Observed:** Polling the previously active process returned `Unknown process
id 47571`, so the completed command's exit status was unavailable.
**Impact:** The repository gate had to be repeated once; additional elapsed time
was not measured.
**Recovery:** Rerun the same gate and rely on the existing Nx cache.
**Detected by:** A follow-up poll of the command session.
**Observed factors:** The command had previously yielded a live session ID; a
later poll reported that the process ID was unknown.
**Hypothesis:** The command completed after its buffered result was truncated,
and the transport discarded the closed session before the next poll.

Evidence: `write_stdin` for process `47571` returned `Unknown process id 47571`
after the gate had started successfully.

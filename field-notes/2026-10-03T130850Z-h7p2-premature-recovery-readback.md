---
observed_at: "2026-10-03T13:08:50Z"
session: "h7p2"
area: "source CLI recovery verification"
---

# Convergence readback started before recovery apply exited

## Friction

A source-CLI sync apply was still running when its result file was parsed and a convergence preview was launched. Parsing failed because the final JSON document had not been written. The live process handle had returned a running session, not an exit status.

## Outcome

The premature read-only preview exited with status 1 before an interruption signal could be delivered. Its output is not verification evidence. Recovery apply subsequently exited successfully; final readback will run after that terminal result.

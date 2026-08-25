---
id: 2026-08-25T151507Z-v6t1
subject: axm-cli-interactions
key: pack-failure-cause-obscured-by-restoration
observed_at: "2026-08-25T15:15:07Z"
session: m4q8
kind: blocked
status: open
---

**Expected:** A failed Pack graph transition would report the transition error and restore its pre-change workspace state.
**Observed:** The third Pack transition stopped, restoration also failed, and ordinary output reported only the restoration failure and retained paths; the original transition cause was not shown.
**Impact:** The migration remained partially applied and required a second clean reconstruction plus a diagnostic apply with debug output to identify the underlying transition failure.
**Recovery:** Remove the retained partial Pack state and rerun the clean reconstruction with debug diagnostics enabled; completion pending.
**Detected by:** Applied configured workspace install result.
**Observed factors:** Two earlier Pack closures committed; the failing closure retained its settings, lock, canonical Pack directory, and some member paths; pre-change snapshots were preserved in an OS-temporary directory.
**Diagnostic evidence:** Command surface `axm install`; exit code 6; restoration detail `restoration incomplete`; 14 retained paths; snapshot directory was supplied; original transition code and detail were not supplied in ordinary output.
**Hypothesis:** Rendering the restoration failure as the primary AppError hides the nested `transitionCause` unless debug diagnostics are requested.
**Suggests:** Include a safe summary of the original transition cause whenever restoration is incomplete.

Evidence: The result enumerated the retained paths and recovery snapshot but did not name which Pack child failed or why the transition began rolling back.

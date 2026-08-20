---
id: 2026-08-20T181350Z-r8k2
subject: axm-cli-interactions
key: update-reintroduces-materialization-markers
observed_at: "2026-08-20T18:13:50Z"
session: unknown
kind: workaround
status: open
---

**Expected:** `axm update` should preserve the repository's current source contract, which no longer includes canonical `.axm-materialization.json` markers.
**Observed:** AXM 0.27.13 regenerated 28 untracked materialization markers that the immediately preceding commit had removed as stale.
**Impact:** The update required one manual cleanup step to avoid reversing the repository's latest source-contract correction.
**Recovery:** Deleted the 28 regenerated derived markers before staging the update; the requested update continued.
**Detected by:** Comparing `git status` with commit `e1f393667`.
**Observed factors:** The update ran on `main` at `e1f393667`; AXM lint was clean and sync preview reported no reconciliation required while the markers existed.
**Hypothesis:** AXM 0.27.13 still emits a canonical marker removed by newer source behavior.

Evidence: Commit `e1f393667` deleted the same 28 paths and states that 0.27.13 rewrote them after the canonical marker was removed; this session's update recreated all 28 as untracked files.

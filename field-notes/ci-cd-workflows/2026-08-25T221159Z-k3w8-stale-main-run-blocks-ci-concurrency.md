---
id: 2026-08-25T221159Z-k3w8
subject: ci-cd-workflows
key: stale-main-run-blocks-ci-concurrency
observed_at: "2026-08-25T22:11:59Z"
session: unknown
kind: workaround
status: open
---

**Expected:** The push-triggered CI run for merge commit
`38e6e14e84fed55bbd14c023d7f931a49110a298` should instantiate jobs after the
preceding visible `main` runs became terminal.
**Observed:** Run `32903624209` remained pending with zero jobs for more than ten
minutes, and rerunning the same push event produced the same state. A repository
queue query revealed older run `32834015664` still queued since
`2026-08-25T09:49:37Z` on `Verify full workspace (trusted-ci)` even though it was
outside the recent-run window used during ordinary monitoring.
**Impact:** The release gate was delayed about 15 minutes and required one
cancel-and-rerun of the current run plus cancellation of one obsolete run.
**Recovery:** Cancelling obsolete run `32834015664` released the workflow
concurrency queue. Current run attempt 2 immediately instantiated jobs and its
classification job completed successfully.
**Detected by:** Comparing the exact run's empty job list with the repository's
complete queued-run API result.
**Observed factors:** Workflow concurrency uses `cancel-in-progress: false` for
push events. The obsolete run was a `main` push for SHA `818ce9f308442dbe58c324b2866ca39d34b9d936`;
its trusted-CI job had no runner assigned.
**Diagnostic evidence:** Current run `32903624209`, attempt 1 `cancelled`, attempt
2 initially `pending` with zero jobs; obsolete run `32834015664`, status
`queued`, job `97758875631`, runner name empty, workflow path
`.github/workflows/ci.yml`.
**Hypothesis:** The non-cancelling `main` concurrency group allowed an obsolete
self-hosted-runner job to retain the workflow queue; tentative.
**Suggests:** Make stale trusted-runner occupancy visible in normal release
monitoring and define an explicit stale-run disposition.

Evidence: Cancelling only the obsolete queued run changed the current run from
pending with zero jobs to a populated job graph with successful classification.

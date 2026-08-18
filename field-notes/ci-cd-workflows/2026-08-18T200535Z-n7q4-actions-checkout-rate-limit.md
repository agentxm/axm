---
id: 2026-08-18T200535Z-n7q4
subject: ci-cd-workflows
key: actions-checkout-rate-limit
observed_at: "2026-08-18T20:05:35Z"
session: s8k2m4
kind: workaround
status: open
---

**Expected:** The trusted full-workspace CI job should set up and run after a
push to `main`.
**Observed:** Job 95850879373 failed during `Set up job` after three attempts to
download `actions/checkout`; GitHub reported HTTP 429 Too Many Requests.
**Impact:** CI verification for commit `58af9b195` was delayed and requires a
failed-job rerun; repository checkout and tests never began in that job.
**Recovery:** Wait for the active workflow to finish, then rerun failed jobs;
completion is pending.
**Detected by:** GitHub check-run annotations after the trusted verifier failed.
**Observed factors:** The Windows lifecycle job continued independently; the
failure occurred before checkout on the trusted runner.
**Hypothesis:** GitHub's codeload endpoint temporarily rate-limited the action
archive download.

Evidence: The annotations report three failed downloads of the pinned
`actions/checkout` archive and a final HTTP 429 response.

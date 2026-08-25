---
id: 2026-08-25T090500Z-q8m4z1
subject: ci-cd-workflows
key: trusted-release-runner-offline-and-stale-concurrency
observed_at: "2026-08-25T09:05:00Z"
session: q8m4z1
kind: workaround
status: open
---

**Expected:** The release pull request's authoritative trusted-runner workflow
should start promptly and complete against the exact release commit.
**Observed:** The organization runner was offline while an older workflow run
retained the trusted concurrency slot, leaving the release verification queued
without an eligible runner.
**Impact:** Release provenance could not be established until the stale run and
runner availability were recovered; elapsed delay was more than ten minutes.
**Recovery:** Cancel the stale prior run, register temporary ephemeral trusted
runners, allow one to drain the older internal job and the other to verify the
exact public release SHA, then confirm both runners deregister automatically.
**Detected by:** GitHub Actions run state, organization runner state, and exact
commit/status readback.
**Observed factors:** The hosted fallback run was available but did not satisfy
the trusted-runner provenance requirement; the recovered run completed every
required job, including five native binary jobs; both temporary runner
registrations disappeared after their one assigned job.
**Diagnostic evidence:** Authoritative run: `32829102392`; release commit:
`9e1fd53838113eafd37fab6c2bb5ba1a56b2055b`; hosted fallback run:
`32829545648`; temporary runner directories were moved recoverably to Trash
after deregistration; credentials and registration material were not retained.
**Hypothesis:** Trusted release verification has a single-runner and shared
concurrency dependency without an automated stale-run or offline-runner
recovery path.

Evidence: GitHub Actions and organization runner readback showed the queued
release run, offline runner, stale predecessor, recovered exact-SHA success,
and automatic ephemeral deregistration.

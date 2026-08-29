---
id: 2026-08-29T123723Z-r9k2
subject: ci-cd-workflows
key: gen-stack-check-null-on-release-pr
observed_at: "2026-08-29T12:37:23Z"
session: r9k2
kind: workaround
status: open
---

**Expected:** The release pull request's Gen Stack mechanical validation job should report a conforming result, matching the repository's required local check.
**Observed:** CI job `99101520885` in run `33252877457` ran `pnpm run gen-stack:check -- --revision HEAD`, printed only `null`, and exited 2. The exact command then passed locally on release commit `da4855fb01bcc966b3030066aeb8c57a0ed8e300` with all mechanical checks conforming.
**Impact:** Pull request 214 could not be merged until the failed hosted job was retried, despite the release candidate passing the same check locally.
**Recovery:** The local reproduction established that the candidate conforms; retry of the failed hosted job was pending at capture time.
**Detected by:** GitHub pull-request CI status and the failed job log.
**Observed factors:** The hosted runner used Ubuntu 24.04 and checked out the pull-request merge commit `b3b7f617c5b89ef2090fd98a27dc9b3ce8ecb5ea`; dependency installation succeeded before the check returned `null`.
**Diagnostic evidence:** CI job exit status 2; local command exit status 0; release version `0.28.2`; pull request 214.
**Hypothesis:** unknown

Evidence: GitHub Actions job `99101520885` log for run `33252877457`, plus the exact local command result on release commit `da4855fb01bcc966b3030066aeb8c57a0ed8e300`.

---
id: 2026-08-25T073012Z-q8m4z1
subject: ci-cd-workflows
key: release-prepare-nx-daemon-hangs-after-commit
observed_at: "2026-08-25T07:30:12Z"
session: q8m4z1
kind: workaround
status: open
---

**Expected:** `pnpm release:prepare` should return from its release commit and
continue to push the release branch and create the pull request.
**Observed:** The release commit `91abef38e` completed, but the parent Bun
process remained waiting with an Nx daemon child attached for more than five
minutes and never entered the push phase.
**Impact:** Canonical release preparation stopped after creating the local
release branch and commit; branch push and pull-request creation required
manual continuation.
**Recovery:** Terminating only the attached Nx daemon left it defunct without
unblocking Bun, so the hung prepare process was interrupted after preserving
the completed release commit; continue the script's documented push and pull
request phases explicitly.
**Detected by:** No release-prepare output after the commit hook completed,
followed by process-tree inspection and exact repository readback.
**Observed factors:** The dry-run completed successfully; the real run passed
the release CI gate; branch `release/cli-v0.27.18` and commit `91abef38e`
existed; no remote release branch or pull request existed; Nx daemon PID 65412
was a direct child of the Bun release process.
**Diagnostic evidence:** Command: `pnpm release:prepare`; interrupted process
exit: 130; release tag: `cli-v0.27.18`; release commit: `91abef38e`; attached
process: Nx daemon `server/start.js`; request or correlation ID: not supplied;
elapsed wait after commit: more than five minutes; retry stop reason: the
release artifacts were already committed, so rerunning the mutation was not
replay-safe.
**Hypothesis:** The commit hook's Nx invocation started a daemon whose inherited
lifetime prevented Bun from returning from the commit subprocess.

Evidence: repository and process-tree readback showed the completed local
release commit, absent remote branch and PR, and the attached Nx daemon.

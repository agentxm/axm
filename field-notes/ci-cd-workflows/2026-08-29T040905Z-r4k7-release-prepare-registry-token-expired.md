---
id: 2026-08-29T040905Z-r4k7
subject: ci-cd-workflows
key: release-prepare-registry-token-expired
observed_at: "2026-08-29T04:09:05Z"
session: x7d3
kind: blocked
status: open
---

**Expected:** The successful `release:prepare --dry-run` preview should be followed by a real prepare that validates the bundled AXM skill and opens the release PR.
**Observed:** The real `release:prepare` mutated local 0.28.2 artifacts, then its Registry publication preview stopped at authoritative preflight because the stored token was invalid or expired.
**Impact:** The release branch and PR were not created after a 6m21s prepare run; generated local release changes require rollback before authentication recovery and retry.
**Recovery:** In progress: restore only generated release artifacts, renew supported Registry authentication, and retry prepare.
**Detected by:** `pnpm release:prepare` bundled-skill publication preview.
**Observed factors:** The release dry run passed; the failure occurred before the release commit, branch, push, or PR phases; one skill candidate was selected.
**Diagnostic evidence:** Exit status 1 from release prepare; nested AXM exit 4; failure code `auth`, class `user`, HTTP 401, problem code `unauthorized`, retryable false, attempt count 1 of 3.
**Hypothesis:** The credential-store session expired between its last successful use and this release.

Evidence: The authoritative publication-set preflight reported `Invalid or expired token`, blocked `@agentxm/skills/axm@0.28.2`, and performed no Registry write.

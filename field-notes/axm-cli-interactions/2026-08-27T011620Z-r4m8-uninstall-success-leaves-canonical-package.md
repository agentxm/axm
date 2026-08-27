---
id: 2026-08-27T011620Z-r4m8
subject: axm-cli-interactions
key: uninstall-success-leaves-canonical-package
observed_at: "2026-08-27T01:16:20Z"
session: q8v2
kind: gap
status: open
---

**Expected:** Explicit uninstall of the three deprecated Registry identities should remove their remaining canonical package directories.
**Observed:** All three uninstall commands reported one committed removal with no failures, but produced no Git diff and left the exact canonical directories present.
**Impact:** The requested deprecated-extension cleanup was not completed by AXM and required an additional bounded cleanup decision.
**Recovery:** Pending exact removal of the three now-unowned canonical directories followed by AXM lint, sync, inventory, formatting, and Git verification.
**Detected by:** Exact filesystem checks and `git status` immediately after the uninstall results.
**Observed factors:** AXM CLI 0.28.1; targets `@craigsmitham/rules/tidy-first`, `@craigsmitham/rules/yagni`, and `@craigsmitham/skills/author-software-work-items`; each preview was ready and each apply result reported `committed` with message `Removed <name>`.
**Diagnostic evidence:** All command exit statuses were 0; each result reported total 1, committed 1, failed 0, rolledBack 0, blocked 0, warnings 0; working tree remained clean; all three source-qualified canonical directories remained present.
**Hypothesis:** After the pack update removed accepted resolutions, uninstall routed ownerless observed packages to non-source-qualified paths and did not delete the source-qualified canonical remnants.
**Suggests:** Resolve uninstall targets from observed source-qualified canonical identity even when their accepted lock rows have already been removed.

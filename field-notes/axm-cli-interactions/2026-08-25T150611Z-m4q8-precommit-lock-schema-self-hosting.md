---
id: 2026-08-25T150611Z-m4q8
subject: axm-cli-interactions
key: precommit-lock-schema-self-hosting
observed_at: "2026-08-25T15:06:11Z"
session: m4q8
kind: blocked
status: open
---

**Expected:** The implementation commit for the lockfile v6 contract would pass the repository's staged AXM lint gate after the product tests and static checks passed.
**Observed:** `./scripts/axm-local lint --view git-index --strict` rejected the repository's tracked v5 `axm-lock.yaml` because the staged CLI expected lockfile version 6.
**Impact:** The implementation commit was prevented once and the AXM repository had to be included in the manual workspace migration before the change could land.
**Recovery:** Reconcile this repository's managed AXM state under the new contract, restage it with the implementation, and rerun the commit gate; completion pending.
**Detected by:** Husky pre-commit hook during the first commit attempt.
**Observed factors:** The staged implementation changes the accepted lockfile version from 5 to 6; this repository uses its local staged CLI for strict pre-commit linting; the tracked workspace lockfile was still version 5.
**Diagnostic evidence:** Command `./scripts/axm-local lint --view git-index --strict`; exit code 9; validation detail `lockfileVersion: Expected 6`; affected artifact `axm-lock.yaml`.
**Hypothesis:** A lock-schema breaking change and the repository's own managed state must be committed atomically because the self-hosted pre-commit gate evaluates the staged CLI against the staged workspace.
**Suggests:** Document the self-hosting requirement in the release workflow for breaking workspace-state changes.

Evidence: The first commit attempt reached the staged AXM lint hook after lint-staged completed, then stopped with validation exit code 9 against the staged v5 lockfile.

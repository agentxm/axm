---
id: 2026-08-29T034939Z-p6n2
subject: axm-cli-interactions
key: pre-push-fresh-worktree-instruction-projections-missing
observed_at: "2026-08-29T03:49:39Z"
session: x7d3
kind: blocked
status: open
---

**Expected:** A clean fresh worktree whose commit and affected gate passed should pass the repository pre-push hook.
**Observed:** `git push origin HEAD:main` stopped in `./scripts/axm-local lint --strict` because the generated root and docs `CLAUDE.md` instruction projections were absent.
**Impact:** The authorized main push was prevented and requires an extra projection-repair step before retrying.
**Recovery:** In progress: regenerate the two AXM-owned instruction projections and retry the push.
**Detected by:** Repository pre-push hook.
**Observed factors:** The change was developed in a fresh linked worktree; the staged affected gate and commit hook had passed; the missing files are ignored projections.
**Diagnostic evidence:** Exit status 1; two auto-fixable `workspace/instructions-target-current` warnings for `./CLAUDE.md` and `./docs/CLAUDE.md`.
**Hypothesis:** The verification and commit paths do not materialize ignored instruction projections required by the worktree-view pre-push lint.

Evidence: The pre-push hook reported exactly two missing generated instruction aliases and rejected the push before remote transfer.

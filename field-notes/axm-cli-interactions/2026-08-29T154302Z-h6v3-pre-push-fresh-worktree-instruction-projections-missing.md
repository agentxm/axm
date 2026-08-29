---
id: 2026-08-29T154302Z-h6v3
subject: axm-cli-interactions
key: pre-push-fresh-worktree-instruction-projections-missing
observed_at: "2026-08-29T15:43:02Z"
session: h6v3
kind: workaround
status: open
---

**Expected:** `git push origin HEAD:main` should pass the repository pre-push
gate from a clean, verified isolated worktree.
**Observed:** The pre-push `./scripts/axm-local lint --strict` command exited 1
because `CLAUDE.md` and `docs/CLAUDE.md` were missing, reporting two auto-fixable
`workspace/instructions-target-current` warnings.
**Impact:** The push was prevented and requires projection repair plus a retry;
elapsed recovery time was not measured.
**Recovery:** Not yet attempted at capture time; the diagnostic prescribed
`axm lint --fix` to regenerate the missing projections.
**Detected by:** The Husky pre-push hook failed before contacting the remote.
**Observed factors:** The work ran in a fresh isolated worktree, the intended
commit and pre-commit affected gate had passed, and both missing paths are
ignored generated instruction projections.
**Diagnostic evidence:** Command `./scripts/axm-local lint --strict`; process
exit status 1; 2 auto-fixable warnings; rule
`workspace/instructions-target-current`; paths `./CLAUDE.md` and
`./docs/CLAUDE.md`; Husky pre-push exit code 1.
**Hypothesis:** A fresh Git worktree does not contain ignored projections that
the strict pre-push workspace lint requires.
**Suggests:** Make the pre-push gate reconcile required projections or document
the fresh-worktree bootstrap step before strict lint.

Evidence: The retained failure result identified both missing paths, the lint
rule, automatic-fix availability, command surface, and exit status; no
credentials or response bodies were present.

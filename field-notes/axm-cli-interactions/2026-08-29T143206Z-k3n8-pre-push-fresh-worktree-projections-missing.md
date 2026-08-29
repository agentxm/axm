---
id: 2026-08-29T143206Z-k3n8
subject: axm-cli-interactions
key: pre-push-fresh-worktree-projections-missing
observed_at: "2026-08-29T14:32:06Z"
session: k3n8
kind: workaround
status: open
---

**Expected:** `git push origin HEAD:main` should pass the repository pre-push
gate from a clean, verified isolated worktree.
**Observed:** The pre-push `./scripts/axm-local lint --strict` command exited 1
because `CLAUDE.md` and `docs/CLAUDE.md` were missing, and reported both as
auto-fixable `workspace/instructions-target-current` warnings.
**Impact:** The push was prevented and required an additional projection repair
and retry; elapsed recovery time was not measured.
**Recovery:** Not yet attempted at capture time; the diagnostic prescribed
`axm lint --fix` to regenerate the instruction projections.
**Detected by:** The Husky pre-push hook failed before contacting the remote.
**Observed factors:** The worktree was isolated, the Git worktree was clean
before the push, `pnpm run ci:affected` had passed after rebasing onto current
`origin/main`, and the two reported files are generated instruction projections.
**Diagnostic evidence:** Command surface `./scripts/axm-local lint --strict`;
process exit status 1; 2 auto-fixable warnings; rule
`workspace/instructions-target-current`; affected paths `./CLAUDE.md` and
`./docs/CLAUDE.md`; Husky pre-push exit code 1.
**Hypothesis:** A fresh Git worktree does not contain ignored instruction
projections required by the pre-push workspace lint.
**Suggests:** Make the pre-push gate reconcile required projections or document
the fresh-worktree bootstrap step before strict lint.

Evidence: The complete failure result identified both missing paths, the lint
rule, automatic fix availability, failing command, and exit status; no
credentials or response bodies were present.

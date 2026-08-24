---
id: 2026-08-24T191742Z-v2n6
subject: axm-cli-interactions
key: pre-push-requires-ignored-instruction-projection
observed_at: "2026-08-24T19:17:42Z"
session: 01a03512-fee3-79a2-8e87-0d51cd2476bb
kind: gap
status: promoted
---

**Expected:** A clean, fully verified commit from the current `main` checkout would pass the repository pre-push checks without additional local workspace state.
**Observed:** The pre-push hook ran `axm lint --strict` and blocked because the gitignored generated projection `docs/CLAUDE.md` was absent, even though AXM's Git-index lint and the affected verification gate were clean.
**Impact:** The first push attempt was rejected locally and required a projection-only AXM repair; the remote was unchanged and elapsed time was not measured.
**Recovery:** Run `axm lint --fix` in the worktree to regenerate the ignored instruction projection, then verify workspace and Git-index lint before retrying the push.
**Detected by:** The Husky pre-push failure from `./scripts/axm-local lint --strict`.
**Observed factors:** The source branch matched `origin/main` before the task; `docs/CLAUDE.md` is ignored by `/docs/CLAUDE.md`; AXM reported the missing target as one auto-fixable `workspace/instructions-target-current` warning.
**Hypothesis:** The pre-push hook validates ignored workspace projections whose presence is not established by repository checkout or dependency installation.
**Suggests:** Generate required ignored projections during repository setup or make the pre-push check validate reproducible source/index state independently of ignored local artifacts.

Evidence: Failed `git push origin main`; AXM finding for `./docs/CLAUDE.md`; successful `axm lint --fix`; subsequent workspace and Git-index strict lint both clean.

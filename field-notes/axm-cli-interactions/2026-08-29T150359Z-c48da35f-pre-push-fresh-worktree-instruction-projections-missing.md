---
id: 2026-08-29T150359Z-c48da35f
subject: axm-cli-interactions
key: pre-push-fresh-worktree-instruction-projections-missing
observed_at: "2026-08-29T15:03:59Z"
session: 01a04dca-eb8b-7561-8748-d2009a63e827
kind: blocked
status: open
---

**Expected:** A verified commit in a fresh isolated worktree should pass the repository pre-push hook without depending on ignored instruction projections.
**Observed:** `git push origin HEAD:main` ran `./scripts/axm-local lint --strict`; AXM reported two auto-fixable `workspace/instructions-target-current` warnings because `CLAUDE.md` and `docs/CLAUDE.md` were missing, and Husky stopped the push.
**Impact:** The first push attempt wrote nothing remotely and required an additional local projection bootstrap and retry.
**Recovery:** Regenerate the ignored instruction projections with the local AXM CLI, verify they remain outside the commit, and retry the push; completion pending at capture time.
**Detected by:** Repository pre-push hook.
**Observed factors:** Fresh Git worktree; feature commit clean; full affected verifier had passed; the two reported projection files were absent.
**Diagnostic evidence:** Push exit status `1`; lint finding count `2`; rule `workspace/instructions-target-current`; affected artifacts `./CLAUDE.md` and `./docs/CLAUDE.md`; both findings reported as auto-fixable; Husky pre-push exit code `1`.
**Hypothesis:** The pre-push hook assumes ignored instruction projections already exist, while fresh worktree setup does not create them.
**Suggests:** Make the documented fresh-worktree bootstrap create these projections or make the pre-push gate self-bootstrap them safely.

---
id: 2026-08-29T063015Z-k7m3
subject: axm-cli-interactions
key: pre-push-fresh-worktree-projections-missing
observed_at: "2026-08-29T06:30:15Z"
session: unknown
kind: workaround
status: open
---

**Expected:** A verified commit in a fresh isolated worktree would pass the repository pre-push hook without unrelated local bootstrap.
**Observed:** `git push origin HEAD:main` was rejected because `./scripts/axm-local lint --strict` reported missing ignored `CLAUDE.md` and `docs/CLAUDE.md` instruction projections.
**Impact:** Publishing required one failed push and an additional local `./scripts/axm-local lint --fix --json` mutation before retrying.
**Recovery:** Generate the ignored instruction projections with the in-flight CLI, confirm strict lint is clean, then retry the push.
**Detected by:** The repository pre-push hook.
**Observed factors:** AXM CLI 0.28.1; fresh isolated project worktree; canonical `AGENTS.md` files present; generated Claude Code projections absent.
**Diagnostic evidence:** Exit 1; two auto-fixable `workspace/instructions-target-current` warnings for `CLAUDE.md` and `docs/CLAUDE.md`.
**Hypothesis:** Fresh-worktree bootstrap does not generate ignored instruction projections even though pre-push treats them as required local state.

Evidence: `./scripts/axm-local lint --fix --json` regenerated both projections and immediately returned zero findings.

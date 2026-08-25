---
id: 2026-08-25T022951Z-c8x4p2
subject: axm-cli-interactions
key: pre-push-requires-ignored-root-alias
observed_at: "2026-08-25T02:29:51Z"
session: c8x4p2
kind: blocked
status: open
---

**Expected:** The clean, fully verified merge commit should pass the repository
pre-push gate without additional untracked workspace state.
**Observed:** `./scripts/axm-local lint --strict` blocked the push because the
gitignored generated root `CLAUDE.md` instruction alias was absent.
**Impact:** The first push attempt was rejected locally after the full affected
gate had passed and required a projection-only workspace repair; the remote was
unchanged and elapsed time was not measured.
**Recovery:** Run the deterministic AXM lint fix to regenerate the ignored
alias, inspect the resulting workspace and index, then retry the push; recovery
had not yet run when captured.
**Detected by:** The Husky pre-push hook's non-zero strict-lint result.
**Observed factors:** The branch contained current `origin/main`; the merge
commit and worktree were clean; `.gitignore` explicitly ignores `/CLAUDE.md`;
the file was absent after checkout and merge; AXM classified the finding as one
auto-fixable `workspace/instructions-target-current` warning.
**Diagnostic evidence:** Failing process:
`git push origin pilot/update-lifecycle`; process exit: 1; failing command:
`./scripts/axm-local lint --strict`; affected artifact: `./CLAUDE.md`; finding
count: 1; auto-fixable count: 1; request or correlation ID: not supplied;
attempt count: 1; retryability: safe after projection repair; retry stop reason:
required ignored instruction alias was missing.
**Hypothesis:** The pre-push hook validates an ignored generated alias whose
presence is not established by checkout, merge, or the affected verification
gate.
**Suggests:** Establish the alias in the repository bootstrap or make pre-push
validate reproducible source/index state independently of ignored projections.

Evidence: strict lint reported only `workspace/instructions-target-current` for
`./CLAUDE.md`; `.gitignore` contains `/CLAUDE.md`; the remote was unchanged.

---
id: 2026-08-29T181451Z-h7p4
subject: axm-cli-interactions
key: pre-push-missing-ignored-instruction-projections
observed_at: "2026-08-29T18:14:51Z"
session: unknown
kind: gap
status: open
---

**Expected:** The clean isolated worktree that passed
`./scripts/axm-local lint --view git-index --strict` during the commit hook
would also pass the repository's pre-push AXM lint.
**Observed:** The pre-push hook's working-tree lint reported missing
`./CLAUDE.md` and `./docs/CLAUDE.md` projections, both auto-fixable from their
canonical `AGENTS.md` sources.
**Impact:** The first push attempt was rejected after all code and repository
verification had passed.
**Recovery:** Materialize the ignored instruction projections with the
repository AXM CLI, then rerun the push.
**Detected by:** `git push origin HEAD:main`, whose Husky pre-push hook ran
`./scripts/axm-local lint --strict`.
**Observed factors:** The work occurred in a newly created Git worktree; the
missing projection paths are ignored and therefore were not populated by Git.
Both findings used rule `workspace/instructions-target-current`.
**Diagnostic evidence:** The hook exited with code 1 and reported exactly two
warnings, one for each missing projection.
**Hypothesis:** New worktrees do not materialize ignored instruction
projections before the pre-push hook requires them.

Evidence: The canonical instruction sources and the committed staged view both
passed strict AXM lint before the push.

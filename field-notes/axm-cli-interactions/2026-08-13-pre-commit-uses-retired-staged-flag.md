---
subject: axm-cli-interactions
key: pre-commit-uses-retired-staged-flag
date: 2026-08-13
kind: blocked
status: open
---

**Expected:** The tracked pre-commit hook would invoke the current AXM lint
surface and validate the staged repository state.

**Actual:** `.husky/pre-commit` invokes `axm lint --staged --strict`, while AXM
0.26.7 rejects `--staged` and exposes `--view git-index` instead.

**Gap:** The repository hook was not migrated with the lint view terminology,
so every normal commit stops before staged lint or affected CI can complete.

**Suggests:** Generate or test repository hook commands against the installed
AXM CLI contract, and replace the retired flag with the current complete-index
view.

Evidence: `axm lint --staged --strict --json` returned usage error
`Unrecognized flag: --staged`; `axm lint --help` listed
`--view workspace|git-index` on AXM 0.26.7.

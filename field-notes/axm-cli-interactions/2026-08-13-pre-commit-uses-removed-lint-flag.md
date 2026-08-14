---
subject: axm-cli-interactions
key: pre-commit-uses-removed-lint-flag
date: 2026-08-13
kind: gap
status: open
---

**Expected:** A repository commit should pass its configured pre-commit command
shape after the documented AXM lint surface changed.

**Actual:** The pre-commit hook invoked `axm lint --staged`, but the installed
command rejects `--staged` and exposes `--view git-index` instead.

**Gap:** The hook retained a removed CLI flag and prevents ordinary commits.

**Suggests:** Generate or update the hook from the authoritative lint command
contract when staged-view syntax changes.

Evidence: `git commit -m "docs: make lockfile authoritative workspace state"`
failed in the pre-commit hook with exit code 2 and `Unrecognized flag:
--staged in command axm lint`.

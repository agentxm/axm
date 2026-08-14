---
subject: ci-cd-workflows
key: affected-ci-pack-test-path-normalization
date: 2026-08-13
kind: blocked
status: open
---

**Expected:** `pnpm run ci:affected` should pass for an architecture-documentation
change whose only production-code edit updates documentation paths.

**Actual:** The full affected CLI suite failed one existing Pack-install test.
The assertion expected only an unchanged member target under `/var/folders`,
while the plan also reported the created Pack target and normalized the member
path under `/private/var/folders`. A focused rerun failed identically.

**Gap:** The test's target-list and temporary-path expectations do not match the
current Pack plan on macOS, even though neither the handler nor its test differs
from `main` in this branch.

**Suggests:** Make the test assert the intended member-reuse behavior without
depending on the macOS `/var` symlink spelling or excluding other truthful plan
targets.

Evidence: `pnpm run ci:affected` failed
`src/root/packs/install/handler.test.ts` at line 850; the focused Nx test failed
the same assertion; `git diff main --` for the handler and test was empty.

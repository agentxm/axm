---
subject: ci-cd-workflows
key: duplicate-local-e2e-gates
date: 2026-08-08
kind: gap
status: open
---

**Expected:** Once the commit hook completed the full affected lint, typecheck, build, test, e2e, and binary-smoke matrix, pushing the unchanged commit would reuse that verified result or run only a complementary gate.
**Actual:** The commit hook spent 3m51s on `axm:verify-affected`, then the push hook reran the affected e2e suite for another 3m26s before uploading the same commit.
**Gap:** Adjacent local gates independently prove overlapping properties and do not share an attestation keyed by commit and toolchain state.
**Suggests:** Let pre-push recognize a successful verify-affected result for the exact commit, or split the hooks so each owns a non-overlapping verification layer.

Evidence: the successful commit-hook output reported `axm:verify-affected` at 3m51s; the immediately following push reported `cli-e2e:e2e` at 3m26s, including 275 source e2e tests and 7 binary smoke tests.

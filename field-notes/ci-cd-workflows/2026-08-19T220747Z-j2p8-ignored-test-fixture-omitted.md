---
id: 2026-08-19T220747Z-j2p8
subject: ci-cd-workflows
key: ignored-test-fixture-omitted
observed_at: "2026-08-19T22:07:47Z"
session: s8n4
kind: gap
status: open
---

**Expected:** Release preparation from a clean checkout should pass the same test suite that passed in the implementation worktree.
**Observed:** The release commit hook failed `core:test` because a new `CLAUDE.md` fixture was absent from the clean checkout even though it existed during implementation verification.
**Impact:** Release preparation stopped before push or pull-request creation and required one diagnosis-and-retry cycle; elapsed delay was not measured.
**Recovery:** The generated release state was retained while the missing tracked fixture was prepared for addition to `main`; release completion was still in progress when captured.
**Detected by:** `pnpm release:prepare` failed at `instructions-rules.test.ts:188` with `fs.existsSync(...)` returning false.
**Observed factors:** `.gitignore` contains the managed `**/CLAUDE.md` pattern; the test fixture referenced `packages/core/src/unstable/lint/__fixtures__/workspace/instructions-gitignore-current/CLAUDE.md`; that path was absent from the implementation commit and present only in its originating worktree.
**Hypothesis:** The broad managed ignore pattern hid the newly created fixture from ordinary staging and status review.
**Suggests:** Add a repository check that rejects tests which reference ignored, untracked fixture files.

Evidence: Release preparation was on `release/cli-v0.27.12`; no release branch push or pull request had occurred; `test-results/core/junit.xml` named the single failing assertion.

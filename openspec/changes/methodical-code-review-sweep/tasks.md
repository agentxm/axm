> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Sweep Framework Setup

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Create a review sweep task ledger template that tracks `file:line`, category, impact, fix recommendation, and status (`open`, `in_progress`, `fixed`).
- [ ] 1.2 Encode the evaluation rubric from design in reviewer-facing docs/checklists, ordered by priority: correctness, safety, reliability, conventions, test quality, style/readability.
- [ ] 1.3 Define sweep phase gates in task documentation: scope, guidance, review, remediation, verification, closure.
- [ ] 1.4 Define explicit no-defer closure rule in task docs: all in-scope findings must be fixed before this change is complete.
- [ ] 1.5 Run `pnpm typecheck` and fix all issues.
- [ ] 1.6 Run `pnpm lint` and fix all issues.
- [ ] 1.7 Run `pnpm test` and fix all failures.
- [ ] 1.8 Run `pnpm test:e2e` and fix all failures.
- [ ] 1.9 Kill any remaining Vitest worker processes.

## 2. Scope and Guidance Collection

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Build the deterministic scope list for this sweep: staged changes, unstaged changes, high-risk modules, then full baseline.
- [ ] 2.2 For each scoped area, record the applicable guidance sources: root `CLAUDE.md`, co-located `CLAUDE.md`, `.claude/skills/`, and `contributing/guides/`.
- [ ] 2.3 Produce a scope coverage manifest proving every in-scope path has mapped guidance.
- [ ] 2.4 Validate that all scoped paths are assigned to at least one review pass.
- [ ] 2.5 Run `pnpm typecheck` and fix all issues.
- [ ] 2.6 Run `pnpm lint` and fix all issues.
- [ ] 2.7 Run `pnpm test` and fix all failures.
- [ ] 2.8 Run `pnpm test:e2e` and fix all failures.
- [ ] 2.9 Kill any remaining Vitest worker processes.

## 3. Review Pass Execution and Finding Capture

> **Subagent:** Run this entire phase in a single subagent.

> **Parallelization:** Tasks 3.2, 3.3, 3.4 are independent — launch as parallel subagents.

- [ ] 3.1 Execute pass A (changed files) and capture findings/commendations using the standardized code-review format.
- [ ] 3.2 Execute pass B (high-risk modules) and capture findings/commendations using the same format.
- [ ] 3.3 Execute pass C (full baseline sweep) and capture findings/commendations using the same format.
- [ ] 3.4 Merge all findings into a single deduplicated ledger with category tags and clear impact statements.
- [ ] 3.5 Verify every finding has exact location, category, impact, suggested fix, and status.
- [ ] 3.6 Verify every in-scope path has been reviewed and represented in findings or commendations.
- [ ] 3.7 Run `pnpm typecheck` and fix all issues.
- [ ] 3.8 Run `pnpm lint` and fix all issues.
- [ ] 3.9 Run `pnpm test` and fix all failures.
- [ ] 3.10 Run `pnpm test:e2e` and fix all failures.
- [ ] 3.11 Kill any remaining Vitest worker processes.

## 4. Remediate Correctness and Safety Findings (Batch A)

> **Subagent:** Run this entire phase in a single subagent.

> **Parallelization:** Tasks 4.2, 4.3, 4.4 are independent where findings do not touch shared files — launch as parallel subagents.

- [ ] 4.1 Convert Batch A findings into implementation tasks grouped by subsystem and dependency order.
- [ ] 4.2 Add or update tests first for correctness findings (red), then implement fixes (green), then refactor.
- [ ] 4.3 Add or update tests first for safety findings (red), then implement fixes (green), then refactor.
- [ ] 4.4 Update finding statuses to `fixed` only with linked evidence (commit diff/test output references).
- [ ] 4.5 Confirm no correctness/safety findings remain `open` or `in_progress`.
- [ ] 4.6 Run `pnpm typecheck` and fix all issues.
- [ ] 4.7 Run `pnpm lint` and fix all issues.
- [ ] 4.8 Run `pnpm test` and fix all failures.
- [ ] 4.9 Run `pnpm test:e2e` and fix all failures.
- [ ] 4.10 Kill any remaining Vitest worker processes.

## 5. Remediate Reliability and Convention Findings (Batch B)

> **Subagent:** Run this entire phase in a single subagent.

> **Parallelization:** Tasks 5.2, 5.3 are independent where findings do not touch shared files — launch as parallel subagents.

- [ ] 5.1 Convert Batch B findings into implementation tasks grouped by dependency order.
- [ ] 5.2 Add or update tests first for reliability findings (red), then implement fixes (green), then refactor.
- [ ] 5.3 Implement convention fixes that affect behavior/contracts; for non-behavioral convention fixes, still include regression checks where risk exists.
- [ ] 5.4 Update finding statuses to `fixed` only with linked evidence.
- [ ] 5.5 Confirm no reliability/convention findings remain `open` or `in_progress`.
- [ ] 5.6 Run `pnpm typecheck` and fix all issues.
- [ ] 5.7 Run `pnpm lint` and fix all issues.
- [ ] 5.8 Run `pnpm test` and fix all failures.
- [ ] 5.9 Run `pnpm test:e2e` and fix all failures.
- [ ] 5.10 Kill any remaining Vitest worker processes.

## 6. Remediate Test Quality and Readability Findings (Batch C)

> **Subagent:** Run this entire phase in a single subagent.

> **Parallelization:** Tasks 6.2, 6.3 are independent where findings do not touch shared files — launch as parallel subagents.

- [ ] 6.1 Convert Batch C findings into implementation tasks grouped by dependency order.
- [ ] 6.2 Add missing regression tests and stabilize brittle/non-deterministic tests.
- [ ] 6.3 Apply readability/style fixes that materially improve maintainability without regressing behavior.
- [ ] 6.4 Update finding statuses to `fixed` only with linked evidence.
- [ ] 6.5 Confirm no test-quality/readability findings remain `open` or `in_progress`.
- [ ] 6.6 Run `pnpm typecheck` and fix all issues.
- [ ] 6.7 Run `pnpm lint` and fix all issues.
- [ ] 6.8 Run `pnpm test` and fix all failures.
- [ ] 6.9 Run `pnpm test:e2e` and fix all failures.
- [ ] 6.10 Kill any remaining Vitest worker processes.

## 7. Final Closure and Validation

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 7.1 Reconcile findings ledger against full sweep scope and prove all in-scope findings are `fixed`.
- [ ] 7.2 Verify no deferred findings exist for this change.
- [ ] 7.3 Publish final review report with summary, full findings history, commendations, and remediation evidence.
- [ ] 7.4 Run `pnpm typecheck` and fix all issues.
- [ ] 7.5 Run `pnpm lint` and fix all issues.
- [ ] 7.6 Run `pnpm test` and fix all failures.
- [ ] 7.7 Run `pnpm test:e2e` and fix all failures.
- [ ] 7.8 Kill any remaining Vitest worker processes.
- [ ] 7.9 Mark change complete only when all task checkboxes are done and all findings are remediated.

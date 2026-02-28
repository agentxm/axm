> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread - always use subagents for implementation work.

## 1. Service Contracts and Repository Foundation

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Add/extend `CodingAgent` service contract with tagged skills-dir outcomes (`supported`, `unsupported`, `disabled`, `misconfigured`) and shared arg/result types.
- [x] 1.2 Add/extend `CodingAgentRepository` interface to return configured agent implementations and surface unknown configured agent ids for policy handling.
- [x] 1.3 Add unit tests first for contract/repository behavior (red), then implement until green.
- [x] 1.4 Run `pnpm typecheck` and fix any issues.
- [x] 1.5 Run `pnpm lint` and fix any issues.
- [x] 1.6 Run `pnpm test` and fix any failures.
- [x] 1.7 Run `pnpm test:e2e` and fix any failures.
- [x] 1.8 Kill any Vitest worker processes.

## 2. Agent Implementations and Resolution Precedence

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phase 1.

- [x] 2.1 Add/extend Claude Code and Gemini CLI service implementations in existing agent modules/folders.
- [x] 2.2 Implement effective skills-dir precedence in each implementation: runtime override -> validated docs mapping -> descriptor fallback.
- [x] 2.3 Encode unsupported/disabled/misconfigured outcomes with clear reasons where applicable.
- [x] 2.4 Add/update tests first for precedence and tagged outcomes (red), then implement until green.
- [x] 2.5 Run `pnpm typecheck` and fix any issues.
- [x] 2.6 Run `pnpm lint` and fix any issues.
- [x] 2.7 Run `pnpm test` and fix any failures.
- [x] 2.8 Run `pnpm test:e2e` and fix any failures.
- [x] 2.9 Kill any Vitest worker processes.

## 3. Skills Install Orchestration Refactor

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 1-2.

- [x] 3.1 Update primary skills install orchestration (`SkillManager`) to resolve configured agents via `CodingAgentRepository` and map each to tagged dir outcomes.
- [x] 3.2 Implement policy handling: skip/report `unsupported` and `disabled`, fail actionable on `misconfigured`.
- [x] 3.3 Add strict vs best-effort behavior for unknown configured agents (strict fails, best-effort warns and continues).
- [x] 3.4 Implement normalized distinct-directory dedupe, perform one materialize/symlink operation per distinct directory, and map per-directory outcomes back to per-agent results.
- [x] 3.5 Keep direct install operation parity (`extensions/skills/operations/install.ts`) with the same outcome + policy semantics for non-manager callers.
- [x] 3.6 Add/update tests first for mixed outcomes, strict/best-effort, dedupe, and per-agent result mapping (red), then implement until green.
- [x] 3.7 Run `pnpm typecheck` and fix any issues.
- [x] 3.8 Run `pnpm lint` and fix any issues.
- [x] 3.9 Run `pnpm test` and fix any failures.
- [x] 3.10 Run `pnpm test:e2e` and fix any failures.
- [x] 3.11 Kill any Vitest worker processes.

## 4. Regression Matrix and Final Verification

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 1-3.

- [x] 4.1 Add/extend regression tests for: shared-dir dedupe, path normalization edge cases, partial per-directory failures, and lockfile/settings behavior under new orchestration.
- [x] 4.2 Verify docs-matrix-backed behavior for currently implemented agents and capture any descriptor/doc drift as follow-up issues.
- [x] 4.3 Run `pnpm typecheck` and fix any issues.
- [x] 4.4 Run `pnpm lint` and fix any issues.
- [x] 4.5 Run `pnpm test` and fix any failures.
- [x] 4.6 Run `pnpm test:e2e` and fix any failures.
- [x] 4.7 Kill any Vitest worker processes.

> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread - always use subagents for implementation work.

## 1. Service Contracts and Repository Foundation

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add/extend `CodingAgent` service contract with tagged skills-dir outcomes (`supported`, `unsupported`, `disabled`, `misconfigured`) and shared arg/result types.
- [ ] 1.2 Add/extend `CodingAgentRepository` interface to return configured agent implementations and surface unknown configured agent ids for policy handling.
- [ ] 1.3 Add unit tests first for contract/repository behavior (red), then implement until green.
- [ ] 1.4 Run `pnpm typecheck` and fix any issues.
- [ ] 1.5 Run `pnpm lint` and fix any issues.
- [ ] 1.6 Run `pnpm test` and fix any failures.
- [ ] 1.7 Run `pnpm test:e2e` and fix any failures.
- [ ] 1.8 Kill any Vitest worker processes.

## 2. Agent Implementations and Resolution Precedence

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phase 1.

- [ ] 2.1 Add/extend Claude Code and Gemini CLI service implementations in existing agent modules/folders.
- [ ] 2.2 Implement effective skills-dir precedence in each implementation: runtime override -> validated docs mapping -> descriptor fallback.
- [ ] 2.3 Encode unsupported/disabled/misconfigured outcomes with clear reasons where applicable.
- [ ] 2.4 Add/update tests first for precedence and tagged outcomes (red), then implement until green.
- [ ] 2.5 Run `pnpm typecheck` and fix any issues.
- [ ] 2.6 Run `pnpm lint` and fix any issues.
- [ ] 2.7 Run `pnpm test` and fix any failures.
- [ ] 2.8 Run `pnpm test:e2e` and fix any failures.
- [ ] 2.9 Kill any Vitest worker processes.

## 3. Skills Install Orchestration Refactor

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 1-2.

- [ ] 3.1 Update primary skills install orchestration (`SkillManager`) to resolve configured agents via `CodingAgentRepository` and map each to tagged dir outcomes.
- [ ] 3.2 Implement policy handling: skip/report `unsupported` and `disabled`, fail actionable on `misconfigured`.
- [ ] 3.3 Add strict vs best-effort behavior for unknown configured agents (strict fails, best-effort warns and continues).
- [ ] 3.4 Implement normalized distinct-directory dedupe, perform one materialize/symlink operation per distinct directory, and map per-directory outcomes back to per-agent results.
- [ ] 3.5 Keep direct install operation parity (`extensions/skills/operations/install.ts`) with the same outcome + policy semantics for non-manager callers.
- [ ] 3.6 Add/update tests first for mixed outcomes, strict/best-effort, dedupe, and per-agent result mapping (red), then implement until green.
- [ ] 3.7 Run `pnpm typecheck` and fix any issues.
- [ ] 3.8 Run `pnpm lint` and fix any issues.
- [ ] 3.9 Run `pnpm test` and fix any failures.
- [ ] 3.10 Run `pnpm test:e2e` and fix any failures.
- [ ] 3.11 Kill any Vitest worker processes.

## 4. Regression Matrix and Final Verification

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 1-3.

- [ ] 4.1 Add/extend regression tests for: shared-dir dedupe, path normalization edge cases, partial per-directory failures, and lockfile/settings behavior under new orchestration.
- [ ] 4.2 Verify docs-matrix-backed behavior for currently implemented agents and capture any descriptor/doc drift as follow-up issues.
- [ ] 4.3 Run `pnpm typecheck` and fix any issues.
- [ ] 4.4 Run `pnpm lint` and fix any issues.
- [ ] 4.5 Run `pnpm test` and fix any failures.
- [ ] 4.6 Run `pnpm test:e2e` and fix any failures.
- [ ] 4.7 Kill any Vitest worker processes.

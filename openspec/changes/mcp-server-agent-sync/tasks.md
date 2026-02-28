> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Extend CodingAgent MCP Service Contracts

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add/extend `CodingAgent` MCP add/remove method contracts and tagged MCP outcomes (`success`, `unsupported`, `disabled`, `misconfigured`, `failed`).
- [ ] 1.2 Add/extend `CodingAgentRepository` surface for configured-agent resolution plus unknown configured agent id policy inputs.
- [ ] 1.3 Add/update unit tests first for service and repository MCP contract behavior (red), then implement to green.
- [ ] 1.4 Run `pnpm typecheck` and fix any issues.
- [ ] 1.5 Run `pnpm lint` and fix any issues.
- [ ] 1.6 Run `pnpm test` and fix any failures.
- [ ] 1.7 Run `pnpm test:e2e` and fix any failures.
- [ ] 1.8 Kill any Vitest worker processes.

## 2. Implement Required Agent Adapters (MCP Add/Remove)

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phase 1.
> **Parallelization:** Tasks 2.2, 2.3, 2.4 are independent — launch as parallel subagents.

- [ ] 2.1 Implement shared MCP command/config execution helper with arg-array invocation, timeout, output capture, and secret redaction.
- [ ] 2.2 Implement required adapters for `claude-code`, `codex`, `gemini-cli` with CLI-first add/remove and config fallback where specified.
- [ ] 2.3 Implement required adapters for `github-copilot`, `cursor`, `opencode` per design command/config strategy.
- [ ] 2.4 Add/update adapter tests first for per-agent command contracts, idempotency mappings, and unsupported-platform behavior (red), then implement to green.
- [ ] 2.5 Run `pnpm typecheck` and fix any issues.
- [ ] 2.6 Run `pnpm lint` and fix any issues.
- [ ] 2.7 Run `pnpm test` and fix any failures.
- [ ] 2.8 Run `pnpm test:e2e` and fix any failures.
- [ ] 2.9 Kill any Vitest worker processes.

## 3. Refactor MCP Install Execution for Agent Sync

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 1-2.

- [ ] 3.1 Update `mcp-servers-install-execute` to delegate agent MCP add through `CodingAgentRepository` configured agents.
- [ ] 3.2 Implement dual-status reporting (canonical install status + agent-sync status) for install operation results.
- [ ] 3.3 Implement best-effort vs strict policy matrix for install outcomes (including unknown configured agents).
- [ ] 3.4 Add/update tests first for install policy behavior (`unsupported`, `disabled`, `misconfigured`, `failed`, unknown-agent) and required-support-set enforcement (red), then implement to green.
- [ ] 3.5 Run `pnpm typecheck` and fix any issues.
- [ ] 3.6 Run `pnpm lint` and fix any issues.
- [ ] 3.7 Run `pnpm test` and fix any failures.
- [ ] 3.8 Run `pnpm test:e2e` and fix any failures.
- [ ] 3.9 Kill any Vitest worker processes.

## 4. Refactor MCP Uninstall Execution for Agent Sync

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 1-2.

- [ ] 4.1 Update `mcp-servers-uninstall-execute` to delegate agent MCP remove through `CodingAgentRepository` configured agents.
- [ ] 4.2 Implement dual-status reporting (canonical uninstall status + agent-sync status) for uninstall operation results.
- [ ] 4.3 Implement best-effort vs strict policy matrix for uninstall outcomes (including unknown configured agents).
- [ ] 4.4 Add/update tests first for uninstall policy behavior (`unsupported`, `disabled`, `misconfigured`, `failed`, unknown-agent) and required-support-set enforcement (red), then implement to green.
- [ ] 4.5 Run `pnpm typecheck` and fix any issues.
- [ ] 4.6 Run `pnpm lint` and fix any issues.
- [ ] 4.7 Run `pnpm test` and fix any failures.
- [ ] 4.8 Run `pnpm test:e2e` and fix any failures.
- [ ] 4.9 Kill any Vitest worker processes.

## 5. Chrome DevTools MCP Validation Coverage

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 3-4.

- [ ] 5.1 Add hermetic tests covering install/uninstall agent-sync flow for `chrome-devtools-mcp` with deterministic mocks.
- [ ] 5.2 Add optional live smoke test harness for `chrome-devtools-mcp` behind explicit non-default execution gate.
- [ ] 5.3 Verify live smoke tests are non-blocking for default CI unless explicitly enabled.
- [ ] 5.4 Run `pnpm typecheck` and fix any issues.
- [ ] 5.5 Run `pnpm lint` and fix any issues.
- [ ] 5.6 Run `pnpm test` and fix any failures.
- [ ] 5.7 Run `pnpm test:e2e` and fix any failures.
- [ ] 5.8 Kill any Vitest worker processes.

## 6. Final Hardening and Drift Audit

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phases 1-5.

- [ ] 6.1 Audit required agent docs/command contracts for drift and record follow-up issues where docs or behavior changed.
- [ ] 6.2 Verify security constraints: no shell interpolation, secret redaction active, platform-aware executable checks.
- [ ] 6.3 Validate operation output shape and user messaging for dual-status canonical vs agent-sync reporting.
- [ ] 6.4 Run `pnpm typecheck` and fix any issues.
- [ ] 6.5 Run `pnpm lint` and fix any issues.
- [ ] 6.6 Run `pnpm test` and fix any failures.
- [ ] 6.7 Run `pnpm test:e2e` and fix any failures.
- [ ] 6.8 Kill any Vitest worker processes.

## Context

MCP server install/uninstall execution currently focuses on workspace/lockfile state and does not enforce agent-configuration synchronization as part of the operation contract. We now have `coding-agent-services` in place for agent-specific delegation and should extend that service boundary to MCP lifecycle behavior.

This change is cross-cutting across MCP install/uninstall operations, coding-agent service contracts, and agent implementations. Backward compatibility is a non-goal; linting and tests must remain green.

## Goals / Non-Goals

**Goals:**

- Add MCP server add/remove delegation methods to `CodingAgent` services.
- Update MCP install/uninstall execution to sync configured agents as part of success criteria.
- Define deterministic behavior for unsupported agents, partial agent failures, and unknown configured agents.
- Validate behavior with `chrome-devtools-mcp` as a concrete registry install/uninstall scenario.
- Deliver required MCP sync support for: `claude-code`, `opencode`, `github-copilot`, `cursor`, `gemini-cli`, and `codex`.

**Non-Goals:**

- Redesigning MCP server manifest/schema formats.
- Refactoring unrelated command families.
- Introducing new agent discovery mechanisms beyond existing configured-agent resolution.

## Decisions

1. Extend `CodingAgent` contract with MCP lifecycle methods

- Decision: Add service methods for MCP add/remove operations with tagged outcomes (success, unsupported, disabled, misconfigured, failed).
- Rationale: Keeps agent-specific configuration mechanics behind one service boundary and avoids hard-coded per-agent branching in operations.
- Alternative considered: Put MCP-specific logic directly in install/uninstall handlers. Rejected due duplication and weak extensibility.

2. Keep repository orchestration pattern from skills install

- Decision: Reuse `CodingAgentRepository` to fetch configured agents and surface unknown configured ids for strict vs best-effort policy.
- Rationale: Maintains consistency with recent service architecture and avoids introducing a second orchestration model.
- Alternative considered: Resolve configured agent ids directly from workspace in MCP handlers. Rejected because it bypasses repository semantics and repeats policy logic.

3. Enforce operation-level policy

- Decision: Default to best-effort for unknown/unsupported agents (warn + continue), fail for misconfigured agent outcomes, and allow strict mode to fail on unknown configured agents. Explicitly define `failed` handling via policy matrix.
- Rationale: Balances reliability and UX; prevents silent misconfiguration while allowing heterogeneous agent setups.
- Alternative considered: fail-fast for any non-success outcome. Rejected as too disruptive for mixed agent environments.

4. Make sync part of MCP lifecycle completion with dual-status reporting

- Decision: MCP install/uninstall reports two statuses: canonical operation status (registry/workspace lifecycle) and agent-sync status (configured-agent reconciliation). "Fully successful" requires both success. Best-effort mode may return canonical success with degraded agent-sync status.
- Rationale: Aligns user expectation: "installed" means usable from configured agents, and "uninstalled" means removed from configured agents.
- Alternative considered: perform best-effort sync as post-step outside operation result semantics. Rejected due ambiguous success reporting.

5. Prefer agent-native CLI/API integration when available (Smithery-style)

- Decision: For each agent, prefer invoking documented native CLI/API commands for MCP add/remove (similar to Smithery's integration approach). Fallback to deterministic config-file mutation only when no stable CLI/API path is available.
- Rationale: Native commands preserve agent-owned validation, schema evolution, and side effects.
- Alternative considered: always patch config files directly. Rejected due brittleness across agent/version changes.

## Agent MCP Integration Matrix

Legend for strategy column:

- `cli`: invoke agent-native CLI/API add/remove commands (Smithery-style)
- `config`: mutate config files directly (schema-aware)
- `mixed`: try CLI first, fallback to config mutation
- `none`: no documented MCP add/remove flow yet (skip + report unsupported)

| Agent            | MCP add/remove docs                                                                             | Current approach                                                                              | Future state approach (this change) |
| ---------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `adal`           | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `amp`            | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `antigravity`    | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `augment`        | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `claude-code`    | https://code.claude.com/docs/en/mcp                                                             | `mixed` (REQUIRED support: prefer CLI/API when available; fallback to config mutation)        | `mixed` (**required**)              |
| `cline`          | TBD                                                                                             | `config` (workspace config mutation)                                                          | `config` (unchanged)                |
| `codebuddy`      | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `codex`          | https://developers.openai.com/codex/mcp                                                         | `mixed` (REQUIRED support: prefer CLI/API when available; fallback to config mutation)        | `mixed` (**required**)              |
| `command-code`   | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `continue`       | TBD                                                                                             | `config` (update continue config for MCP servers)                                             | `config` (unchanged)                |
| `crush`          | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `cursor`         | https://cursor.com/docs/context/mcp                                                             | `mixed` (REQUIRED support: prefer Cursor CLI/API when available; fallback to config mutation) | `mixed` (**required**)              |
| `droid`          | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `gemini-cli`     | https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md           | `mixed` (REQUIRED support: prefer CLI/API when available; fallback to config mutation)        | `mixed` (**required**)              |
| `github-copilot` | https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp | `mixed` (REQUIRED support: prefer native CLI/API path; fallback to config mutation)           | `mixed` (**required**)              |
| `goose`          | TBD                                                                                             | `config` (update goose config/extensions manifests)                                           | `config` (unchanged)                |
| `iflow-cli`      | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `junie`          | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `kilo`           | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `kimi-cli`       | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `kiro-cli`       | TBD                                                                                             | `config` (update custom-agent resources/config)                                               | `config` (unchanged)                |
| `kode`           | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `mcpjam`         | TBD                                                                                             | `cli` (agent is MCP-focused; use native commands where available)                             | `cli` (unchanged)                   |
| `mistral-vibe`   | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `mux`            | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `neovate`        | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `openclaw`       | TBD                                                                                             | `config` (update openclaw tool/server config)                                                 | `config` (unchanged)                |
| `opencode`       | https://opencode.ai/docs/mcp-servers                                                            | `mixed` (REQUIRED support: config-first with CLI/API verification/auth flows)                 | `mixed` (**required**)              |
| `openhands`      | TBD                                                                                             | `none` (skip + report unsupported for CLI path)                                               | `none` (unchanged)                  |
| `pi`             | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `pochi`          | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `qoder`          | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `qwen-code`      | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `replit`         | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `roo`            | TBD                                                                                             | `config` (update roo MCP configuration)                                                       | `config` (unchanged)                |
| `trae`           | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `trae-cn`        | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |
| `windsurf`       | TBD                                                                                             | `config` (update windsurf MCP config if documented)                                           | `config` (unchanged)                |
| `zencoder`       | TBD                                                                                             | `none` (skip + report unsupported)                                                            | `none` (unchanged)                  |

Notes:

- `TBD` doc links are intentionally explicit placeholders; we should fill these with validated MCP add/remove docs before implementation lock.
- Required support set for this change: `claude-code`, `opencode`, `github-copilot`, `cursor`, `gemini-cli`, `codex`.
- Agents outside the required support set may remain `unsupported` in this change and should be clearly reported.
- Include one integration validation case: `chrome-devtools-mcp`.

## Outcome Policy Matrix

| Outcome                    | Best-effort mode                                                                         | Strict mode                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `success`                  | include in synced set                                                                    | include in synced set                                  |
| `unsupported`              | warn + skip                                                                              | warn + skip                                            |
| `disabled`                 | warn + skip                                                                              | fail if in required support set, otherwise warn + skip |
| `misconfigured`            | fail operation                                                                           | fail operation                                         |
| `failed`                   | mark agent-sync degraded; canonical may remain success; return non-green overall summary | fail operation                                         |
| `unknown-configured-agent` | warn + skip                                                                              | fail operation                                         |

## Required Support Docs Matrix

| Agent            | MCP config docs                                                                                 | MCP CLI command docs                                                                     | Notes                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `claude-code`    | https://code.claude.com/docs/en/mcp                                                             | https://code.claude.com/docs/en/mcp                                                      | Same page documents config scopes and `claude mcp add/list/get/remove`.                |
| `opencode`       | https://opencode.ai/docs/mcp-servers                                                            | https://opencode.ai/docs/mcp-servers                                                     | Primarily config-driven; page documents `opencode mcp auth/list/logout` command flows. |
| `github-copilot` | https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers | Config and Copilot CLI MCP command docs validated.                                     |
| `cursor`         | https://cursor.com/docs/context/mcp                                                             | https://cursor.com/docs/cli/mcp                                                          | Config and Cursor CLI MCP command docs validated.                                      |
| `gemini-cli`     | https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md           | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/tutorials/mcp-setup.md    | Source-of-truth docs currently referenced in upstream repo paths.                      |
| `codex`          | https://developers.openai.com/codex/mcp                                                         | https://developers.openai.com/codex/mcp                                                  | Same page documents config + `codex mcp` command usage.                                |

## Planned CLI Invocation Approach

For required agents with MCP CLI support, we will use a shared Smithery-style command delegation pattern implemented inside `CodingAgent` services.

### Execution model

- Build per-agent command adapters that produce normalized plans for:
  - `add` (register server)
  - `remove` (unregister server)
  - optional `verify` (list/get for idempotency checks)
- Keep command planning pure; perform execution only at service boundary.
- Execute commands via a shared Effect wrapper with captured `stdout`/`stderr` and typed error mapping.

### Safety and determinism

- Use argument arrays (`command` + `args`) rather than interpolated shell strings.
- Preflight-check executable presence and minimum command support.
- Apply bounded timeout for CLI execution.
- Treat semantic idempotency states (`already exists`, `not found`) as success when appropriate.
- Preserve strict path safety and avoid writing secrets to logs.
- Never use interpolated shell command strings for invocation.
- Redact secrets/tokens from captured stdout/stderr before logging or error propagation.
- Enforce OS-aware executable discovery with actionable errors when unavailable.

### Outcome mapping

- Exit success -> `success`.
- Command not available / unsupported version -> `unsupported`.
- Feature disabled or auth/session missing -> `disabled`.
- Invalid flags/config shape -> `misconfigured`.
- Other non-zero exit -> `failed` with stable error code and summarized stderr.

### Required-agent implementation plan

- `claude-code`: prefer `claude mcp add/remove`; fallback to config mutation if CLI path unavailable.
- `codex`: use `codex mcp add/remove` as primary path.
- `gemini-cli`: use documented `gemini mcp` command path when supported; fallback to config updates.
- `github-copilot`: use documented Copilot CLI MCP add/remove path, fallback to config path when unavailable.
- `cursor`: prefer Cursor MCP CLI path when available (`cursor mcp ...`), fallback to config updates.
- `opencode`: config-first; use `opencode mcp` commands where they add verification/auth flow support.

### Per-agent command contract (required support set)

Each required agent SHALL define a concrete command/config contract before implementation lock:

- `addCommand`: exact executable + args pattern for add/register
- `removeCommand`: exact executable + args pattern for remove/unregister
- `verifyCommand`: optional list/get command for idempotency and post-apply verification
- `idempotentExitPatterns`: stderr/stdout signatures treated as semantic success
- `authPreconditions`: required tokens/session/login checks
- `fallbackConfigPath`: exact config mutation path if CLI path is unavailable

Initial expected command families:

- `claude-code`: `claude mcp add/remove` (+ optional `claude mcp list/get` verify)
- `codex`: `codex mcp add/remove` (+ optional `codex mcp list` verify)
- `gemini-cli`: `gemini mcp ...` command family where available
- `github-copilot`: documented Copilot CLI MCP add/remove command flow
- `cursor`: `cursor mcp ...` command family where available
- `opencode`: config-first + `opencode mcp` auth/list/logout helpers for verification

### Shared helper surface

- Introduce an internal helper for service adapters:
  - input: `{ command: string; args: ReadonlyArray<string>; timeoutMs: number }`
  - output: `{ exitCode: number; stdout: string; stderr: string }`
- Centralize parsing/normalization so all agents return consistent tagged outcomes and telemetry fields.

### Security and compatibility constraints

- CLI invocation helpers SHALL redact sensitive values from process output before persistence/logging.
- CLI invocation SHALL be implemented with argument arrays only (no shell interpolation).
- Agent adapters SHALL declare platform support and executable lookup behavior explicitly (darwin/linux/windows handling).
- If agent CLI is unavailable on current platform, adapter SHALL return deterministic `unsupported` with fix guidance.

## Reconciliation and rollback policy

- Canonical registry install/uninstall steps SHALL execute first and report canonical status.
- Agent-sync steps SHALL execute second and report agent-sync status.
- In best-effort mode, canonical success SHALL NOT be rolled back for `unsupported`, `disabled`, or `unknown-configured-agent` outcomes.
- In strict mode, failing outcomes (`misconfigured`, `failed`, strict unknown-agent policy violations) SHALL fail the operation.
- Compensating rollback of canonical registry changes is out of scope for this change; instead, operation output SHALL include explicit follow-up remediation guidance.

## Test execution boundaries

- CI-required tests SHALL be hermetic (mocked/subprocess-stubbed), deterministic, and network-independent.
- Optional live smoke tests MAY run outside default CI to validate real integration behavior for `chrome-devtools-mcp`.
- Live smoke failures SHALL not block default CI gates unless explicitly enabled by release/pipeline policy.

## Risks / Trade-offs

- [Agent supports MCP in docs but not in local config state] -> Mitigation: return `disabled` with actionable reason and report in result summary.
- [Partial sync across many agents obscures root cause] -> Mitigation: aggregate per-agent outcomes in operation result with stable error codes.
- [Registry install success but sync failure causes user confusion] -> Mitigation: explicit result messaging distinguishing canonical install from agent sync status.
- [Strict mode behavior mismatch between install/uninstall paths] -> Mitigation: shared helper for policy evaluation and outcome aggregation.

## Migration Plan

1. Extend coding-agent service interfaces and repository-facing outcome types for MCP add/remove.
2. Implement agent adapters for required support set: Claude Code, OpenCode, GitHub Copilot, Cursor, Gemini CLI, and Codex.
3. Refactor `mcp-servers-install-execute` to invoke repository + per-agent add method and apply policy.
4. Refactor `mcp-servers-uninstall-execute` to invoke repository + per-agent remove method and apply policy.
5. Add/extend tests for mixed agent outcomes and explicit `chrome-devtools-mcp` flow coverage.
6. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e`.

Rollback: remove MCP methods from coding-agent services and revert install/uninstall execution to pre-sync behavior.

## Open Questions

- Do we need lockfile metadata fields to capture per-agent MCP sync status for diagnostics?

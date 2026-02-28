## Phase 6 Audit

### 6.1 Docs/contract drift audit

- Reviewed required adapters (`claude-code`, `codex`, `gemini-cli`, `github-copilot`, `cursor`, `opencode`) against command/config contracts in `design.md`.
- Verified implementation contracts in `packages/cli/src/agents/*/service.ts` match expected command families and fallback strategy.
- Drift fixed in this phase: executable preflight behavior is now explicit and platform-aware in `packages/cli/src/agents/mcp-sync.ts`.

### Follow-up issues

1. `MCP-DOC-DRIFT-001` - External MCP CLI doc URLs are volatile (especially repo-path docs); add periodic link/contract verification in release checklist.
2. `MCP-OUTPUT-002` - Dual-status is currently emitted via operation message text; consider structured status fields in operation results for machine consumers.

### 6.2 Security constraints verification

- No shell interpolation: CLI execution uses `spawn(command, args[])` with arg arrays only.
- Secret redaction active: stdout/stderr redaction remains enforced; invocation error details now redact arg text as well.
- Platform-aware executable checks active: adapters now preflight executable availability using PATH/PATHEXT-aware lookup before invocation.

### 6.3 Output shape/messaging verification

- Install/uninstall success messages include both statuses: `canonical=success` and `agent-sync=<green|degraded>`.
- Strict-mode failures still fail operation for policy-failing outcomes (`misconfigured`, strict `failed`, strict unknown-configured-agent, required-agent disabled).
- Best-effort behavior preserves canonical success while reporting degraded sync where applicable.

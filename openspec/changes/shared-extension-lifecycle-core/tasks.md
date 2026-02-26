## 1. Lifecycle Kernel Foundation

- [ ] 1.1 Add failing tests for shared lockfile/settings mutation parity across install/uninstall operations.
- [ ] 1.2 Define lifecycle kernel interfaces: intent model, mutation model, and driver registry contract.
- [ ] 1.3 Implement pure shared mutation planner (immutable `ReadonlyArray` transforms only).
- [ ] 1.4 Implement shared mutation executor (centralized lockfile/settings writes + routed materialization hooks).
- [ ] 1.5 Run `pnpm typecheck` and fix errors.

## 1b. Command-Family Workflow Foundation

- [ ] 1b.1 Add failing tests for install-family and uninstall-family workflow phase order.
- [ ] 1b.2 Define shared command primitives plus two family workflows (`runInstallWorkflow`, `runUninstallWorkflow`).
- [ ] 1b.3 Implement shared diagnostics helpers for source-host probe logging in install-family workflow.
- [ ] 1b.4 Run `pnpm typecheck` and fix errors.

## 2. Skills Migration (Native + Non-Native)

- [ ] 2.1 Add/adjust tests for skill install/uninstall via install-family/uninstall-family workflows + kernel, including `PackagingKind` branch behavior.
- [ ] 2.2 Implement `SkillDriver` with native vs non-native materialization paths.
- [ ] 2.3 Migrate skill handlers to install-family/uninstall-family workflows.
- [ ] 2.4 Remove duplicated lockfile/settings mutation logic from skill operation handlers.
- [ ] 2.5 Run `pnpm typecheck` and fix errors.

## 3. MCP Server Migration (Target-Scoped)

- [ ] 3.1 Add/adjust tests for workspace vs per-agent `mcp-server` materialization through install-family/uninstall-family workflows + kernel.
- [ ] 3.2 Implement `McpServerDriver` with target-scoped materialization behavior.
- [ ] 3.3 Migrate `mcp-server` handlers to install-family/uninstall-family workflows.
- [ ] 3.4 Remove duplicated lockfile/settings mutation logic from MCP operation handlers.
- [ ] 3.5 Run `pnpm typecheck` and fix errors.

## 4. Pack Migration (Cross-Type Intents)

- [ ] 4.1 Add/adjust tests for pack dependency expansion into cross-type install/uninstall intents (`skill` and `mcp-server` only in this change).
- [ ] 4.2 Implement `PackDriver` install intent expansion from pack resolution.
- [ ] 4.3 Implement `PackDriver` uninstall intent expansion with preserve-configured behavior.
- [ ] 4.4 Deduplicate expanded cross-type identities by extension identity tuple.
- [ ] 4.5 Migrate pack handlers to install-family/uninstall-family workflows.
- [ ] 4.6 Remove duplicated lockfile/settings mutation logic from pack handlers.
- [ ] 4.7 Run `pnpm typecheck` and fix errors.

## 5. Parity Hardening and Cleanup

- [ ] 5.1 Add contract tests that all three drivers pass shared install/uninstall invariants.
- [ ] 5.2 Validate preview/apply parity remains unchanged under the current plan/job model.
- [ ] 5.3 Validate source/discovery diagnostics parity across `skill`/`mcp-server`/`pack` install handlers using install-family workflow.
- [ ] 5.4 Run `pnpm lint` and fix issues.
- [ ] 5.5 Run `pnpm test` and fix failures.
- [ ] 5.6 Run `pnpm test:e2e` for impacted suites and fix failures.

## Scope Guard

- [ ] SG.1 Confirm no `command` lifecycle driver is introduced in this change.

## Why

The `@axm.sh/cli` package contains substantial business logic — extension management, workspace orchestration, registry access, auth, source resolution — that is not CLI-specific but cannot be reused outside the CLI today. Extracting this logic into `@axm.sh/core` enables non-CLI consumers (APIs, SDKs, GUIs, programmatic tooling) to manage extensions, resolve sources, and interact with registries using the same domain engine the CLI uses.

## What Changes

- **Move operation workflows to core**: `install-operation/` and `uninstall-operation/` (the `ExtensionManager` contract, `ExtensionTarget` types, `UninstallRetentionPolicy`, `buildInstallOperation`, `buildUninstallOperation`) — these are pure domain logic with `R = never`, no CLI dependencies.
- **Move extension managers and operations to core**: `extensions/skills/`, `extensions/packs/`, `extensions/commands/`, `extensions/mcp-servers/` — manager implementations, operations (install/enable/disable/rename/uninstall), reconciliation adapters, path computation.
- **Move workspace service to core**: `workspace/service.ts`, plan types, reconciliation engine, taxonomy/classifier, initialization, paths. **BREAKING**: `resolvePlan` must be decomposed — pure `applyPlan` moves to core, interactive confirmation stays in CLI.
- **Move registry clients to core**: `registry/client.ts`, `registry/client-remote.ts`, `registry/local-client.ts`, `registry/local-schema.ts`, `registry/utils.ts` — abstract client, remote HTTP implementation, local filesystem implementation.
- **Move auth business logic to core**: `auth/credential-store.ts`, `auth/auth-client.ts`, `auth/auth-middleware.ts`, `auth/token-resolution.ts`, `auth/schema.ts`, `auth/device-login.ts`, `auth/oauth-contract.ts`. CLI-specific `login-interaction.ts` (TUI prompts) and `guard.ts` (command decorator) stay in CLI.
- **Move source resolution to core**: `sources/service.ts` (`SourceHostProviders`), `sources/resolve-source.ts`, `sources/resolve-source-pattern.ts`, provider implementations (`git.ts`, `git-hosting.ts`, `local.ts`, `builtin.ts`, `registry/`).
- **Move git operations to core**: `git/operations.ts` (`shallowClone`, `getTreeSha`).
- **Move plan types and execution to core**: `workspace/plan.ts` (Plan, Job, JobStep, PlannedJobStep, CompletedJobStep, JobStepResult), `workspace/apply-plan.ts` — the pure plan execution engine.
- **CLI retains**: command definitions (`root/`), command workflows (`install-command/`, `uninstall-command/`), interactive plan confirmation/display (`display-plan.ts`), TUI-specific auth interaction, builtin pack definitions, CLI flags, runtime/entry points.
- **New core export paths**: Each moved module gets a `@axm.sh/core/unstable/*` export (e.g., `unstable/workspace`, `unstable/registry`, `unstable/auth`, `unstable/git`, `unstable/extension-operations`).

## Capabilities

### New Capabilities

- `core-extension-operations`: Extension install/uninstall operation lifecycle, `ExtensionManager` contract, `ExtensionTarget` types, `UninstallRetentionPolicy`, and operation builders — the domain engine for managing extensions programmatically.
- `core-workspace`: Workspace service, plan types, plan application, reconciliation engine, taxonomy/classifier, workspace initialization and paths — the stateful domain layer for managing extension state.
- `core-registry`: Registry client abstraction (local + remote), schema types, version selection, and registry utilities — programmatic registry access.
- `core-auth`: Credential storage, auth client (OAuth device flow + token refresh), auth middleware, token resolution — authentication without CLI interaction.
- `core-source-resolution`: Source host providers, source resolution, source pattern parsing, and provider implementations (git, git-hosting, local, builtin, registry) — resolving extension sources programmatically.
- `core-git`: Git operations (shallow clone, tree SHA) as Effect services.

### Modified Capabilities

_None. Existing behavior is unchanged — this restructures where code lives, not what it does. Existing specs remain valid; they describe behavior that is now available from both CLI and core._

## Impact

- **`@axm.sh/core` package**: Significant new export surface (~6 new `unstable/*` entry points). New dependencies may be needed (e.g., HTTP client for registry, git operations).
- **`@axm.sh/cli` package**: Becomes a thin CLI layer — commands, handlers, TUI interaction, and command workflow orchestration. All business logic imports shift from relative paths to `@axm.sh/core/unstable/*`.
- **`resolvePlan` decomposition**: The current `Workspace.resolvePlan` mixes plan application (domain) with interactive confirmation (CLI). Must be split into `applyPlan` (core) and interactive wrapper (CLI). This is the most structurally complex part of the migration.
- **Test migration**: Unit tests for moved logic relocate to core. CLI handler tests and E2E tests stay in their current packages.
- **Phased migration**: (1) `git/`, `registry/`, `auth/` — self-contained with few internal deps. (2) `workspace/`, `sources/` — the domain engine. (3) `extensions/` and operation workflows — depend on workspace + registry. Command workflows move last, after `resolvePlan` decomposition.

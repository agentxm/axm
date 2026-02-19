> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Pack publish populates VersionEntry.dependencies

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Write tests for pack publish dependency flattening: manifest `skills`, `commands`, `mcp-servers` entries expand to `@scope/skills/name`, `@scope/commands/name`, `@scope/mcp-servers/name` keys in `VersionEntry.dependencies`. Cover: skills-only, mixed types, no dependencies.
- [x] 1.2 Implement dependency flattening in `publish-pack.ts`: read manifest's skills/commands/mcp-servers maps, expand short FQN keys (`@scope/name`) to full FQNs (`@scope/<type-plural>/name`), and include in the `VersionEntry.dependencies` field passed to `client.publishExtension()`.
- [x] 1.3 Typecheck (`pnpm typecheck`), fix any errors.
- [x] 1.4 Run tests (`pnpm test`), fix any failures.
- [x] 1.5 Run linting (`pnpm lint`), fix any errors.
- [x] 1.6 Kill any vitest worker processes.

## 2. PackExtensionRef carries structured dependencies

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Write tests for `toExtensionRef` pack mapping: given a `RegistryExtensionManifest` with type `"pack"` and flat dependencies (`@scope/skills/name`, `@scope/commands/name`, `@scope/mcp-servers/name` keys), the returned `PackExtensionRef` has `pack.skills`, `pack.commands`, `pack.mcpServers` populated. Cover: mixed types, empty deps, malformed keys ignored.
- [x] 2.2 Update `PackExtensionRefBase` type in `sources/types.ts`: add `skills`, `commands`, `mcpServers` fields to the `pack` property (all `Readonly<Record<string, string>>`).
- [x] 2.3 Update `toExtensionRef` in `host-provider.ts`: for the `"pack"` case, partition `entry.dependencies` by key prefix (`/skills/`, `/commands/`, `/mcp-servers/`) into the structured `pack.skills`, `pack.commands`, `pack.mcpServers` maps. Preserve full FQN keys. Ignore malformed keys.
- [x] 2.4 Update any other code that constructs `PackExtensionRef` values (e.g., builtin pack) to include the new fields with empty maps if not applicable.
- [x] 2.5 Typecheck (`pnpm typecheck`), fix any errors.
- [x] 2.6 Run tests (`pnpm test`), fix any failures.
- [x] 2.7 Run linting (`pnpm lint`), fix any errors.
- [x] 2.8 Kill any vitest worker processes.

## 3. Simplify buildInstallPlan to construct dependency operations

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Write tests for `buildInstallPlan`: given a `PackExtensionRef` with `pack.skills` entries, the plan includes `InstallPackOperation` for the pack plus `InstallSkillOperation`s for each skill dependency. Cover: no deps, some already installed (no-op), version constraints passed through.
- [x] 3.2 Update `buildInstallPlan` signature to accept a `PackExtensionRef` (instead of pre-built operation array). Build `InstallPackOperation` and `InstallSkillOperation`s internally from the ref's `pack.skills`/`pack.commands`/`pack.mcpServers` data.
- [x] 3.3 Typecheck (`pnpm typecheck`), fix any errors.
- [x] 3.4 Run tests (`pnpm test`), fix any failures.
- [x] 3.5 Run linting (`pnpm lint`), fix any errors.
- [x] 3.6 Kill any vitest worker processes.

## 4. Move fetch/extract into install-pack operation

> **Subagent:** Run this entire phase in a single subagent.

- [x] 4.1 Write tests for updated `installPack` operation handler: given an `InstallPackOperationArgs` with a `PackExtensionRef`, it fetches the archive via `sources.fetch()`, extracts to the managed location, and writes lockfile/settings entries.
- [x] 4.2 Update `InstallPackOperationArgs` in `operations.ts` to include the `PackExtensionRef` (or the fields needed to call `sources.fetch()`).
- [x] 4.3 Update `installPack` operation handler in `install-pack.ts`: add fetch via `sources.fetch()`, extract to `.axm/extensions/@scope/packs/pack-name/` via `copySkillDirectory`, then write lockfile/settings via `ws.setPack()`.
- [x] 4.4 Typecheck (`pnpm typecheck`), fix any errors.
- [x] 4.5 Run tests (`pnpm test`), fix any failures.
- [x] 4.6 Run linting (`pnpm lint`), fix any errors.
- [x] 4.7 Kill any vitest worker processes.

## 5. Simplify handler and update input parsing

> **Subagent:** Run this entire phase in a single subagent.

- [x] 5.1 Write tests for input parsing: `@scope/packs/pack-name` accepted, `@scope/packs/pack-name@^2.0.0` accepted, `pack-name` resolved to `@defaultScope/packs/pack-name`, `@scope/pack-name` (without `/packs/`) rejected, non-registry sources rejected.
- [x] 5.2 Update `command.ts` input validation if needed to enforce the new input patterns.
- [x] 5.3 Rewrite `handler.ts`: parse input → `sources.find()` for `PackExtensionRef` → pass ref to `buildInstallPlan` → execute plan via `ws.resolvePlan()`. Remove all fetch, extract, manifest read, and per-dependency resolution logic.
- [x] 5.4 Typecheck (`pnpm typecheck`), fix any errors.
- [x] 5.5 Run tests (`pnpm test`), fix any failures.
- [x] 5.6 Run linting (`pnpm lint`), fix any errors.
- [x] 5.7 Kill any vitest worker processes.

## 6. E2E tests and final verification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 6.1 Update existing pack install e2e tests to use new input format (`@scope/packs/pack-name` and bare `pack-name`).
- [x] 6.2 Add e2e test: install pack with dependencies, verify pack and skills appear in lockfile, skills not in settings.
- [x] 6.3 Add e2e test: install pack with `--preview` shows plan without applying.
- [x] 6.4 Run e2e tests (`pnpm test:e2e`), fix any failures.
- [x] 6.5 Run full test suite (`pnpm test`), fix any failures.
- [x] 6.6 Typecheck (`pnpm typecheck`), fix any errors.
- [x] 6.7 Run linting (`pnpm lint`), fix any errors.
- [x] 6.8 Kill any vitest worker processes.

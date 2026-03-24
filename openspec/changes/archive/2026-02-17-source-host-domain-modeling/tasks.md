> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Core Domain Types

> **Subagent:** Run this entire phase in a single subagent.

Define the new type hierarchy in `sources/types.ts` alongside existing types. Add migration aliases so existing code continues to compile.

- [x] 1.1 Write tests for SourceType union (all 8 members including "builtin"), SourceHost variants, SourceParams variants, and Source flat intersections — verify discriminator-based narrowing works
- [x] 1.2 Add `"builtin"` to `SourceType` union in `sources/types.ts`
- [x] 1.3 Define all `SourceHost` interfaces (`GitHubSourceHost`, `GitLabSourceHost`, `BitbucketSourceHost`, `AzureReposSourceHost`, `GitSourceHost`, `RegistrySourceHost`, `LocalSourceHost`, `BuiltinSourceHost`) and the `SourceHost` union
- [x] 1.4 Define all `SourceParams` interfaces (`GitHubSourceParams`, `GitLabSourceParams`, `BitbucketSourceParams`, `AzureReposSourceParams`, `GitSourceParams`, `RegistrySourceParams`, `LocalSourceParams`, `BuiltinSourceParams`) and the `SourceParams` union
- [x] 1.5 Define all `Source` intersection types (`GitHubSource`, `GitLabSource`, etc.) and the `Source` union — ensure flat intersection gives access to all host + params fields via `switch (source.type)`
- [x] 1.6 Define convenience unions: `GitHostingSourceHost`, `GitHostingSourceParams`, `GitHostingSource`, `GitBasedSource`, `ConfiguredSourceHost`, `SelfDescribingSourceHost`
- [x] 1.7 Define `FindableExtensionType` (`"skill" | "pack" | "mcp-server"`)
- [x] 1.8 Define ref detail interfaces: `GitHostedRefDetails`, `RegistryRefDetails`, `LocalRefDetails`, `BuiltinRefDetails`
- [x] 1.9 Define `SkillRefBase`, all `SkillExtensionRef` variants per source type, and the `SkillExtensionRef` union
- [x] 1.10 Define `McpServerRefBase`, all `McpServerExtensionRef` variants (GitHub, Registry, Local, Builtin), and the `McpServerExtensionRef` union
- [x] 1.11 Define `PackExtensionRef` variants (`RegistryPackRef`, `BuiltinPackRef`) and the `PackExtensionRef` union
- [x] 1.12 Define `SourceExtensionRef` union (`SkillExtensionRef | McpServerExtensionRef | PackExtensionRef`)
- [x] 1.13 Write tests for `SourceParams` structural equality via `Data.struct()` + `Equal.equals()` — including the Azure Repos bug fix (compare all 3 fields)
- [x] 1.14 Add deprecated migration aliases: `SourceInput = SourceParams`, `ExtensionRef = SourceExtensionRef`, `SourceProvider = SourceHostProvider`, `SourceProviders = SourceHostProviders`
- [x] 1.15 Export all new types from `sources/index.ts`
- [x] 1.16 Run `pnpm typecheck` and fix any errors
- [x] 1.17 Run `pnpm lint` and fix any errors
- [x] 1.18 Run `pnpm test` and fix any failures
- [x] 1.19 Run `pnpm test:e2e` and fix any failures
- [x] 1.20 Kill any vitest worker processes

## 2. Settings Schema Updates

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Rename `SourceConfig` → `SourceHostConfig` in settings. Add `Option<ReadonlyArray<string>>` for registry scopes. Update workspace service.

- [x] 2.1 Write tests for `SourceHostConfig` schema encoding/decoding — verify registry scopes roundtrip (`undefined ↔ None`, `string[] ↔ Some(ReadonlyArray)`) and URL fields decode as `URL` objects
- [x] 2.2 Rename `SourceConfigSchema` → `SourceHostConfigSchema` in `settings/schema.ts`, rename individual schemas (`GitHubSourceConfigSchema` → `GitHubSourceHostConfigSchema`, etc.)
- [x] 2.3 Update `RegistrySourceHostConfigSchema` to use `Schema.optionFromNullishOr` for `scopes` field and `Schema.URL` (or transform) for `url` fields
- [x] 2.4 Update all git hosting config schemas to use `Schema.URL` for `url` fields
- [x] 2.5 Rename exported type `SourceConfig` → `SourceHostConfig` and individual config types (`GitHubSourceConfig` → `GitHubSourceHost` etc.)
- [x] 2.6 Update `workspace/service.ts`: rename `getConfiguredSources()` return type, update `BUILT_IN_SOURCES` to use new `SourceHostConfig` type
- [x] 2.7 Update all imports of `SourceConfig` across the codebase to use `SourceHostConfig`
- [x] 2.8 Run `pnpm typecheck` and fix any errors
- [x] 2.9 Run `pnpm lint` and fix any errors
- [x] 2.10 Run `pnpm test` and fix any failures
- [x] 2.11 Run `pnpm test:e2e` and fix any failures
- [x] 2.12 Kill any vitest worker processes

## 3. Provider Interface and Service

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Rename `SourceProvider` → `SourceHostProvider`, add `match()` method. Define `PublishableSourceHostProvider`. Rename `SourceProviders` → `SourceHostProviders` service, add `cloneUrl()` and `origin()` methods.

- [x] 3.1 Write tests for `SourceHostProvider` interface shape (type, match, find, fetch) and `PublishableSourceHostProvider` (extends with publishVersion)
- [x] 3.2 Rename `SourceProvider` → `SourceHostProvider` in `sources/provider.ts`, add `match(url: URL) → Effect<boolean, AppError, R>` method, parameterize on `S extends Source`
- [x] 3.3 Define `PublishableSourceHostProvider<S, R>` extending `SourceHostProvider<S, R>` with `publishVersion` method
- [x] 3.4 Update `FindOptions.type` to use `FindableExtensionType | "*"` instead of `"skill" | "mcp-server" | "*"`
- [x] 3.5 Rename `SourceProvidersService` → `SourceHostProvidersService` in `sources/service.ts` — replace `resolveExtension` with `find(source, options)`, keep `fetch(ref)`, add `cloneUrl(source) → Option<string>`, add `origin(source) → string`
- [x] 3.6 Rename `SourceProviders` tag → `SourceHostProviders` tag
- [x] 3.7 Move `buildCloneUrl` logic from `sources/clone-url.ts` into the service's `cloneUrl` method (return `Option<string>` for non-git sources instead of error)
- [x] 3.8 Move `getOrigin` logic from `sources/clone-url.ts` into the service's `origin` method, add `"builtin"` case
- [x] 3.9 Move `printSourceInput` logic from `sources/printer.ts` into the service's `origin` method (or consolidate with getOrigin)
- [x] 3.10 Update `sources/index.ts` exports for renamed types and service
- [x] 3.11 Run `pnpm typecheck` and fix any errors
- [x] 3.12 Run `pnpm lint` and fix any errors
- [x] 3.13 Run `pnpm test` and fix any failures
- [x] 3.14 Run `pnpm test:e2e` and fix any failures
- [x] 3.15 Kill any vitest worker processes

## 4. Provider Implementations

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.2–4.3, 4.4, 4.5, 4.6, 4.7 are independent — launch as parallel subagents after 4.1 is complete.

Depends on: Phase 3.

Update all provider factories to accept `SourceHost` at construction time and implement the new `SourceHostProvider` interface. Add builtin provider.

- [x] 4.1 Write tests for provider contract: each provider constructed with appropriate SourceHost, match/find/fetch accept correct Source variant, return SourceExtensionRef
- [x] 4.2 Update `createGitHostingProvider` factory in `providers/git-hosting.ts` to accept `SourceHost` (e.g., `GitHubSourceHost`), implement `match(url)` by hostname comparison, update `find` to return `SourceExtensionRef` (with full Source + GitHostedRefDetails), update `fetch`
- [x] 4.3 Update `createAzureReposProvider` in `providers/azurerepos.ts` — same pattern as git hosting but with `organization/project/repo` params
- [x] 4.4 Update `createGitProvider` in `providers/git.ts` — self-describing (no host config), implement `match` for git/ssh schemes
- [x] 4.5 Update `createLocalProvider` in `providers/local.ts` — self-describing (no host config), implement `match` for file:// URLs and paths, return `SourceExtensionRef` with `LocalRefDetails`
- [x] 4.6 Update `createRegistryProvider` in `providers/registry.ts` — accept `RegistrySourceHost`, implement `PublishableSourceHostProvider`, populate `checksum` in `find()` from registry index, return `SourceExtensionRef` with `RegistryRefDetails`
- [x] 4.7 Create `BuiltinSourceHostProvider` in `providers/builtin.ts` — `match` always returns false, `find` does in-memory lookup of bundled extensions, return `SourceExtensionRef` with `BuiltinRefDetails`
- [x] 4.8 Update `createRegistryMetaProvider` in `sources/service.ts` to construct individual registry providers with `RegistrySourceHost` from settings
- [x] 4.9 Wire all providers into the `SourceHostProviders` service layer
- [x] 4.10 Run `pnpm typecheck` and fix any errors
- [x] 4.11 Run `pnpm lint` and fix any errors
- [x] 4.12 Run `pnpm test` and fix any failures
- [x] 4.13 Run `pnpm test:e2e` and fix any failures
- [x] 4.14 Kill any vitest worker processes

## 5. Source Resolution Updates

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3, 4.

Update `resolveSource` to produce `Source` (type-safe `SourceHost + SourceParams` intersection). Remove `as Source` assertions. Registry sources carry host config. Remove standalone clone-url/printer utilities.

- [x] 5.1 Write tests for resolveSource producing Source with host config — GitHub shorthand, registry with url/scopes from host, local with trivial host, type-safe intersection (no assertions)
- [x] 5.2 Update `resolveSource` in `sources/resolve-source.ts` to intersect `SourceHost` (from settings config) with `SourceParams` (from parser) — remove all `as Source` assertions (6 instances per design)
- [x] 5.3 Update registry resolution path: find matching `RegistrySourceHostConfig` by scope routing, intersect `RegistrySourceHost` + `RegistrySourceParams` → `RegistrySource` (with url, scopes from host)
- [x] 5.4 Update URL/SCP matching to use provider `match()` method as fallback when hostname matching against configs fails (enable future source refinement)
- [x] 5.5 Update name resolution: lockfile lookup → `LocalSource` pointing to installed directory; configured skills → recursive `resolveSource()` on configured source string
- [x] 5.6 Delete `sources/clone-url.ts` (functionality moved to service in Phase 3)
- [x] 5.7 Update `sources/printer.ts`: rename `lockEntryToSourceInput` → `lockEntryToSourceParams`, update return type; remove `printSourceInput` (moved to service `origin()`)
- [x] 5.8 Update all callers of `buildCloneUrl`, `getOrigin`, `printSourceInput` to use `SourceHostProviders` service methods
- [x] 5.9 Update `sources/index.ts` exports — remove deleted utilities, export updated functions
- [x] 5.10 Run `pnpm typecheck` and fix any errors
- [x] 5.11 Run `pnpm lint` and fix any errors
- [x] 5.12 Run `pnpm test` and fix any failures
- [x] 5.13 Run `pnpm test:e2e` and fix any failures
- [x] 5.14 Kill any vitest worker processes

## 6. Resolution Module Cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5.

Remove `resolveExtension` and associated types from the resolution module. Resolution now only produces `Source` via `resolveSource`. Extension discovery is exclusively through `SourceHostProviders.find()`.

- [x] 6.1 Write tests verifying the new resolution flow: `resolveSource(input)` → `Source`, then `sourceHostProviders.find(source, options)` → `SourceExtensionRef[]`
- [x] 6.2 Remove `ExtensionRef` and `ExtensionMetadata` types from `resolution/types.ts` (the resolution-layer types, not the source-layer ones)
- [x] 6.3 Remove `ResolutionOptions` from `resolution/types.ts`
- [x] 6.4 Remove `resolveExtension` from `resolution/resolver.ts`
- [x] 6.5 Remove or refactor individual resolvers in `resolution/resolvers/` that are subsumed by `resolveSource`: `axm-name.ts`, `bare-name.ts`, `explicit-source.ts`, `local-path.ts`, `url.ts`, `ambiguous.ts`
- [x] 6.6 Update `resolution/index.ts` barrel — remove deleted exports, keep `ExtensionType` (canonical definition stays in `extensions/common.ts`)
- [x] 6.7 Update all imports of `resolveExtension`, resolution `ExtensionRef`, `ExtensionMetadata`, `ResolutionOptions` across the codebase — replace with `resolveSource` + `SourceHostProviders.find()`
- [x] 6.8 Run `pnpm typecheck` and fix any errors
- [x] 6.9 Run `pnpm lint` and fix any errors
- [x] 6.10 Run `pnpm test` and fix any failures
- [x] 6.11 Run `pnpm test:e2e` and fix any failures
- [x] 6.12 Kill any vitest worker processes

## 7. Operation Args and Lock Entry Conversion

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 6.

Update operation args to take `SourceExtensionRef` directly instead of flat fields. Update lock entry conversion to switch on `ref.source.type`.

- [x] 7.1 Write tests for `InstallSkillOperationArgs` with `ref: SkillExtensionRef` — verify registry refs carry version/checksum, git refs carry location/gitTreeSha
- [x] 7.2 Update `InstallSkillOperationArgs` in `cli-commands/skills/operations.ts` to take `ref: SkillExtensionRef` instead of flat `source`, `skill`, `location`, `version`, `gitTreeSha` fields
- [x] 7.3 Update `CopySkillOperationArgs` to take `ref: SkillExtensionRef` instead of flat `source`, `targetName`, `location` fields
- [x] 7.4 Write tests for `sourceToLockEntry` switching on `ref.source.type` — verify registry refs populate version/checksum/sourceName, git refs populate gitTreeSha, builtin entries work
- [x] 7.5 Update `sourceToLockEntry` in `cli-commands/skills/source-to-lock-entry.ts` to accept `SkillExtensionRef` and switch on `ref.source.type` for source-specific fields
- [x] 7.6 Update `lockEntryToSourceParams` (renamed from `lockEntryToSourceInput`) to handle `"builtin"` entries without throwing
- [x] 7.7 Update all callers of `InstallSkillOperationArgs`, `CopySkillOperationArgs`, and `sourceToLockEntry` to pass `SourceExtensionRef` instead of flat fields
- [x] 7.8 Run `pnpm typecheck` and fix any errors
- [x] 7.9 Run `pnpm lint` and fix any errors
- [x] 7.10 Run `pnpm test` and fix any failures
- [x] 7.11 Run `pnpm test:e2e` and fix any failures
- [x] 7.12 Kill any vitest worker processes

## 8. Consumer Migration

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 8.2, 8.3, 8.4, 8.5, 8.6, 8.7 are independent — launch as parallel subagents after 8.1 is complete.

Depends on: Phase 7.

Update all command handlers and consumers to use the new domain types throughout.

- [x] 8.1 Audit all files still using deprecated aliases (`SourceInput`, old `ExtensionRef`, `SourceProvider`, old `SourceProviders`) — create checklist of files needing migration
- [x] 8.2 Update `cli-commands/skills/install/discover-skills.ts` to use `resolveSource()` + `SourceHostProviders.find()` instead of `resolveExtension()`
- [x] 8.3 Update `cli-commands/skills/install/handler.ts` to use new operation args with `SourceExtensionRef`
- [x] 8.4 Update `cli-commands/skills/update/handler.ts` to use `Data.struct()` + `Equal.equals()` for source comparison (replacing manual ~30-line switch)
- [x] 8.5 Update `cli-commands/skills/fork/handler.ts` to use new domain types
- [x] 8.6 Update `cli-commands/skills/publish-skill.ts` and `cli-commands/packs/publish/publish-pack.ts` to use new domain types
- [x] 8.7 Update any remaining command handlers and utilities that reference old source/resolution types
- [x] 8.8 Run `pnpm typecheck` and fix any errors
- [x] 8.9 Run `pnpm lint` and fix any errors
- [x] 8.10 Run `pnpm test` and fix any failures
- [x] 8.11 Run `pnpm test:e2e` and fix any failures
- [x] 8.12 Kill any vitest worker processes

## 9. Cleanup and Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 8.

Remove migration aliases, delete dead code, verify everything compiles and passes.

- [x] 9.1 Remove deprecated migration aliases from `sources/types.ts` (`SourceInput`, `ExtensionRef`, `SourceProvider`, `SourceProviders`)
- [x] 9.2 Remove `sources/clone-url.ts` if not already deleted in Phase 5
- [x] 9.3 Remove unused resolver files from `resolution/resolvers/` if not already cleaned up in Phase 6
- [x] 9.4 Remove `ProviderRegistry` type from `sources/provider.ts` (internal dispatch is now implementation detail of service)
- [x] 9.5 Verify no remaining `as Source` type assertions in source resolution code
- [x] 9.6 Verify `sources/types.ts` is the single source of truth for all source domain types
- [x] 9.7 Run `pnpm typecheck` and fix any errors
- [x] 9.8 Run `pnpm lint` and fix any errors
- [x] 9.9 Run `pnpm test` and fix any failures
- [x] 9.10 Run `pnpm test:e2e` and fix any failures
- [x] 9.11 Kill any vitest worker processes
- [x] 9.12 Run `pnpm build` to verify production build succeeds

> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Type Changes

> **Subagent:** Run this entire phase in a single subagent.

Update the `Source` type definitions in `types.ts` to simplify `RegistrySource` and ensure `Source` types are ready for downstream use.

- [x] 1.1 Simplify `RegistrySource` type in `sources/types.ts`: change from `RegistrySourceInput & RegistrySourceConfig` to `RegistrySourceInput`
- [x] 1.2 Audit all usages of `RegistrySource` type across the codebase and fix any compile errors from the simplified type
- [x] 1.3 Run `pnpm typecheck` and fix any errors
- [x] 1.4 Run `pnpm lint` and fix any errors
- [x] 1.5 Run `pnpm test` and fix any failures
- [x] 1.6 Run `pnpm test:e2e` and fix any failures
- [x] 1.7 Kill any vitest worker processes

## 2. Core `resolveSource` Function

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Create the new `resolveSource` function that combines `determineSourceInput` with config matching from `Workspace`.

- [x] 2.1 Write tests for `resolveSource` in `sources/resolve-source.test.ts` covering: GitHub shorthand → GitHubSource with config, local path passthrough, registry passthrough, git passthrough, single config fallback, no config for source type error
- [x] 2.2 Create `sources/resolve-source.ts` with `resolveSource(input: string)` — pipeline: `determineSourceInput` → match on discriminator → merge config for git hosting types, passthrough for git/local/registry
- [x] 2.3 Run `pnpm typecheck` and fix any errors
- [x] 2.4 Write tests for multi-config matching by URL hostname: URL input matches correct config, SCP input matches by hostname, no matching hostname fails
- [x] 2.5 Implement multi-config URL/SCP hostname matching in `resolveSource` — compare parsed hostname against hostnames derived from each config's `url` field
- [x] 2.6 Run `pnpm typecheck` and fix any errors
- [x] 2.7 Write tests for config-name shorthand: two-phase parse for config-name prefix (e.g., `ghe:owner/repo`), standard shorthand still works, unknown prefix fails, source-type prefix selects first config when multiple exist
- [x] 2.8 Implement two-phase parse in `resolveSource` — on `determineSourceInput` failure, check if prefix before `:` matches a config name, re-parse using that config's source type descriptor
- [x] 2.9 Run `pnpm typecheck` and fix any errors
- [x] 2.10 Export `resolveSource` from `sources/index.ts` barrel
- [x] 2.11 Run `pnpm lint` and fix any errors
- [x] 2.12 Run `pnpm test` and fix any failures
- [x] 2.13 Run `pnpm test:e2e` and fix any failures
- [x] 2.14 Kill any vitest worker processes

## 3. `buildCloneUrl` Update

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Update `buildCloneUrl` and `getOrigin` to accept `Source` and use config `url` field.

- [x] 3.1 Update tests in `sources/clone-url.test.ts` (or create if missing) to pass `Source` objects with config `url` field, verify clone URLs use config base URL instead of hardcoded values
- [x] 3.2 Change `buildCloneUrl` signature from `(source: SourceInput)` to `(source: Source)` — use `source.url` for github/gitlab/bitbucket/azurerepos cases
- [x] 3.3 Update `getOrigin` signature from `(source: SourceInput)` to `(source: Source)` — use `source.url` for git hosting cases
- [x] 3.4 Fix all call sites of `buildCloneUrl` and `getOrigin` to pass `Source` instead of `SourceInput`
- [x] 3.5 Run `pnpm typecheck` and fix any errors
- [x] 3.6 Run `pnpm lint` and fix any errors
- [x] 3.7 Run `pnpm test` and fix any failures
- [x] 3.8 Run `pnpm test:e2e` and fix any failures
- [x] 3.9 Kill any vitest worker processes

## 4. `SourceProviders` Service Interface

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Rename `resolve` → `resolveExtension` and change parameter from `SourceInput` to `Source`.

- [x] 4.1 Update `SourceProvidersService` interface in `sources/service.ts`: rename `resolve` to `resolveExtension`, change parameter type from `SourceInput` to `Source`
- [x] 4.2 Update `SourceProvidersLive` layer implementation: rename the `resolve` method to `resolveExtension` in the returned object
- [x] 4.3 Update the `SourceProvider` interface in `sources/provider.ts`: change `find` parameter type from the specific `SourceInput` variant to the corresponding `Source` variant
- [x] 4.4 Update provider implementations (github, gitlab, bitbucket, azurerepos, git, local, registry) to accept `Source` variants in `find` and `fetch` signatures
- [x] 4.5 Run `pnpm typecheck` and fix any errors
- [x] 4.6 Update tests for `sources/service.ts` and provider tests to use `Source` objects and `resolveExtension` name
- [x] 4.7 Run `pnpm lint` and fix any errors
- [x] 4.8 Run `pnpm test` and fix any failures
- [x] 4.9 Run `pnpm test:e2e` and fix any failures
- [x] 4.10 Kill any vitest worker processes

## 5. Handler and Resolver Migration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3, 4.

> **Parallelization:** Tasks 5.1–5.2 and 5.3–5.4 are independent — launch as parallel subagents.

Migrate handlers and resolvers to use `resolveSource` and `resolveExtension`.

- [ ] 5.1 Update `cli-commands/skills/install/handler.ts`: replace `determineSourceInput` with `resolveSource`, replace `sources.resolve` with `sources.resolveExtension`
- [ ] 5.2 Update `cli-commands/skills/fork/handler.ts`: replace `determineSourceInput` with `resolveSource`, replace `sources.resolve` with `sources.resolveExtension`
- [ ] 5.3 Update `resolution/resolvers/explicit-source.ts`: replace `determineSourceInput` with `resolveSource` (or keep `determineSourceInput` if only `SourceInput` is needed), update any `sources.resolve` calls to `sources.resolveExtension`
- [ ] 5.4 Update `resolution/resolvers/url.ts`: same as 5.3
- [ ] 5.5 Update `printSource` in `sources/printer.ts` to accept `Source` (which extends `SourceInput`, so this may just be a type annotation change)
- [ ] 5.6 Run `pnpm typecheck` and fix any errors
- [ ] 5.7 Update handler tests and resolver tests for the new function names and types
- [ ] 5.8 Run `pnpm lint` and fix any errors
- [ ] 5.9 Run `pnpm test` and fix any failures
- [ ] 5.10 Run `pnpm test:e2e` and fix any failures
- [ ] 5.11 Kill any vitest worker processes

## 6. Barrel Export Cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5.

Ensure the public API is clean and no stale exports remain.

- [ ] 6.1 Update `sources/index.ts` barrel: export `resolveSource`, verify `determineSourceInput` is still exported (lower-level API), ensure `Source` types are exported
- [ ] 6.2 Remove any unused imports of `determineSourceInput` from files that now use `resolveSource`
- [ ] 6.3 Run `pnpm typecheck` and fix any errors
- [ ] 6.4 Run `pnpm lint` and fix any errors
- [ ] 6.5 Run `pnpm test` and fix any failures
- [ ] 6.6 Run `pnpm test:e2e` and fix any failures
- [ ] 6.7 Kill any vitest worker processes

> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Source type rename and RegistrySourceInput simplification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Rename `Source` to `SourceInput` in `sources/types.ts`; simplify `RegistrySource` to `RegistrySourceInput` (no `url`/`path` fields — just `{ source: "registry" }`)
- [x] 1.2 Rename `parseSource` to `parseSourceInput` in `sources/parser.ts`; update registry parsing to return the simplified `RegistrySourceInput`
- [x] 1.3 Update all imports and references across the codebase (`Source` → `SourceInput`, `parseSource` → `parseSourceInput`, `RegistrySource` → `RegistrySourceInput`)
- [x] 1.4 Update all test files to use new type/function names
- [x] 1.5 Run `pnpm typecheck` and fix any errors
- [x] 1.6 Run `pnpm lint` and fix any errors
- [x] 1.7 Run `pnpm test` and fix any failures
- [x] 1.8 Run `pnpm test:e2e` and fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. CommonManifestFields evolution and managed extension manifest

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (independent of Phase 1).

- [x] 2.1 In `extensions/common.ts`, replace `author: Schema.optional(AuthorSchema)` with `authors: Schema.optional(Schema.Array(AuthorSchema))` in `CommonManifestFields`
- [x] 2.2 Update tests in `extensions/common.test.ts` for the `author` → `authors` change
- [x] 2.3 Update any other manifest schemas/tests that reference `author` (skill, mcp-server, command, pack manifests)
- [x] 2.4 Create `axm-skill.json` manifest schema in `extensions/skills/` extending `CommonManifestFields` with `agents: Schema.Array(Schema.String)` and `dependencies: Schema.optional(Schema.Record(...))`
- [x] 2.5 Write tests for the new `axm-skill.json` manifest schema
- [x] 2.6 Run `pnpm typecheck` and fix any errors
- [x] 2.7 Run `pnpm lint` and fix any errors
- [x] 2.8 Run `pnpm test` and fix any failures
- [x] 2.9 Run `pnpm test:e2e` and fix any failures
- [x] 2.10 Kill any vitest worker processes

## 3. Registry layout schemas

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (independent of Phases 1–2).

- [x] 3.1 Create `registry/` feature folder with `index.ts` barrel
- [x] 3.2 Define `VersionEntrySchema` (version, published, agents, dependencies, engines, checksum) as Effect Schema
- [x] 3.3 Define `ExtensionIndexSchema` (name, scope, type, description, repository, license, authors, versions) as Effect Schema
- [x] 3.4 Write tests for `VersionEntrySchema` — valid entries, missing fields, forward-compatible agent strings
- [x] 3.5 Write tests for `ExtensionIndexSchema` — valid index, missing required fields, multiple versions ordered newest first
- [x] 3.6 Run `pnpm typecheck` and fix any errors
- [x] 3.7 Run `pnpm lint` and fix any errors
- [x] 3.8 Run `pnpm test` and fix any failures
- [x] 3.9 Kill any vitest worker processes

## 4. Settings schema evolution (sources array + scope)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (uses `SourceInput` types).

- [x] 4.1 Define `SourceConfigSchema` as a discriminated union on `source` field in `settings/schema.ts` with 5 variants (github, gitlab, bitbucket, azurerepos, registry)
- [x] 4.2 Add `scope: Schema.optional(Schema.String)` to settings schema
- [x] 4.3 Evolve `sources` field from per-provider-key object to `Schema.optional(Schema.Array(SourceConfigSchema))`
- [x] 4.4 Write tests for `SourceConfigSchema` — valid entries for each variant, name validation regex, location normalization, scopes field
- [x] 4.5 Write tests for evolved settings schema — new sources array format, scope field, old format rejection
- [x] 4.6 Run `pnpm typecheck` and fix any errors
- [x] 4.7 Run `pnpm lint` and fix any errors
- [x] 4.8 Run `pnpm test` and fix any failures
- [x] 4.9 Run `pnpm test:e2e` and fix any failures
- [x] 4.10 Kill any vitest worker processes

## 5. Workspace service extensions (getSources, getScope, getRegistrySources)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4 (uses `SourceConfig` types).

- [x] 5.1 Define built-in source defaults (github, gitlab, bitbucket) in `workspace/service.ts`
- [x] 5.2 Implement `getSources()` — three-layer merge (project → global → built-in) with name-based deduplication and caching
- [x] 5.3 Implement `getSourceByName(name)` — lookup from merged list, returns `Option<SourceConfig>`
- [x] 5.4 Implement `getRegistrySources(scope: Option<string>)` — filter to registry sources with scope routing (scope-matched exclusive of catch-all)
- [x] 5.5 Implement `getScope()` — project > global > prompt (persist to project settings)
- [x] 5.6 Implement `addSource(source)` — append to project settings sources array (semaphore-serialized)
- [x] 5.7 Write tests for `getSources()` — merge ordering, deduplication, caching
- [x] 5.8 Write tests for `getRegistrySources()` — scope filtering, catch-all fallback, mutual exclusivity
- [x] 5.9 Write tests for `getScope()` — resolution chain, prompt persistence
- [x] 5.10 Write tests for `addSource()` — append behavior, concurrency
- [x] 5.11 Run `pnpm typecheck` and fix any errors
- [x] 5.12 Run `pnpm lint` and fix any errors
- [x] 5.13 Run `pnpm test` and fix any failures
- [x] 5.14 Run `pnpm test:e2e` and fix any failures
- [x] 5.15 Kill any vitest worker processes

## 6. SourceProvider interface and existing provider migration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (uses `SourceInput`), Phase 5 (uses workspace service for ambiguous resolution).

> **Parallelization:** Tasks 6.4, 6.5, 6.6, 6.7, 6.8, 6.9 are independent — launch as parallel subagents.

- [x] 6.1 Define `SourceProvider<S, R>` interface, `FindOptions`, `ExtensionRef` (SkillRef/McpServerRef), `ExtensionFiles`, `SourceError`, `RegistryError` types in `sources/provider.ts`
- [x] 6.2 Define `ProviderRegistry` type mapping source type → provider
- [x] 6.3 Write tests for `ExtensionRef` — field contracts, version Option semantics
- [x] 6.4 Migrate GitHub source to `GitHubSourceProvider` implementing `SourceProvider<GitHubSource>`
- [x] 6.5 Migrate GitLab source to `GitLabSourceProvider` implementing `SourceProvider<GitLabSource>`
- [x] 6.6 Migrate Bitbucket source to `BitbucketSourceProvider` implementing `SourceProvider<BitbucketSource>`
- [x] 6.7 Migrate Azure Repos source to `AzureReposSourceProvider` implementing `SourceProvider<AzureReposSource>`
- [x] 6.8 Migrate git source to `GitSourceProvider` implementing `SourceProvider<GitRepositorySource>`
- [x] 6.9 Migrate local source to `LocalSourceProvider` implementing `SourceProvider<LocalSource>`
- [x] 6.10 Update `SkillRef` — replace `path`/`registry` fields with `source: SourceInput`, `location: string`, `version: Option<string>`
- [x] 6.11 Update `operations.ts` — evolve `AddSkillOperation` to use new `SkillRef`
- [x] 6.12 Update tests for all migrated providers
- [x] 6.13 Run `pnpm typecheck` and fix any errors
- [x] 6.14 Run `pnpm lint` and fix any errors
- [x] 6.15 Run `pnpm test` and fix any failures
- [x] 6.16 Run `pnpm test:e2e` and fix any failures
- [x] 6.17 Kill any vitest worker processes

## 7. Registry source providers (local + remote stub)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3 (registry schemas), Phase 6 (SourceProvider interface).

- [x] 7.1 Define `RegistrySourceProvider` interface extending `SourceProvider<RegistrySourceInput>` with `fetchIndex`, `fetchArchive`, `publishVersion`, `checkNameExists`
- [x] 7.2 Implement `LocalRegistrySourceProvider` — `find` (read index.json, version selection by semver + agent filter), `fetch` (read archive, verify SHA-256, extract zip)
- [x] 7.3 Implement `LocalRegistrySourceProvider` — `fetchIndex`, `fetchArchive`, `publishVersion`, `checkNameExists` via filesystem I/O
- [x] 7.4 Implement `RemoteRegistrySourceProvider` stub — all operations fail with "remote registry not yet supported"
- [x] 7.5 Implement `createRegistryProvider(location)` factory — dispatch by location scheme (file/path → local, https → remote stub)
- [x] 7.6 Write tests for `LocalRegistrySourceProvider.find` — semver range matching, agent filtering, 404 fallthrough, empty index
- [x] 7.7 Write tests for `LocalRegistrySourceProvider.fetch` — successful extraction, checksum verification, checksum mismatch
- [x] 7.8 Write tests for `LocalRegistrySourceProvider.publishVersion` — new index creation, index update (prepend), idempotency (same checksum = no-op, different checksum = error)
- [x] 7.9 Write tests for `RemoteRegistrySourceProvider` — all operations fail with descriptive error
- [x] 7.10 Write tests for `createRegistryProvider` factory — local path, file:// URL, https:// URL
- [x] 7.11 Run `pnpm typecheck` and fix any errors
- [x] 7.12 Run `pnpm lint` and fix any errors
- [x] 7.13 Run `pnpm test` and fix any failures
- [x] 7.14 Kill any vitest worker processes

## 8. Registry meta-provider and SourceProviders service

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5 (workspace getRegistrySources), Phase 7 (registry providers).

- [x] 8.1 Implement `createRegistryMetaProvider` — wraps N configured registries into a single `SourceProvider<RegistrySourceInput>`, reads `workspace.getRegistrySources()` lazily, applies scope routing (scope-matched exclusive of catch-all, 404 fallthrough within set)
- [x] 8.2 Implement `SourceProviders` Effect service tag and interface (`resolve`, `fetch`)
- [x] 8.3 Implement `SourceProvidersLive` layer — construct provider registry with all source type providers, depends on `FileSystem`, `Path`, `WorkspaceContext`
- [x] 8.4 Write tests for registry meta-provider — scope routing, lazy config reads, 404 fallthrough, hard fail on non-404 errors
- [x] 8.5 Write tests for `SourceProviders` service — dispatch to correct provider by source type
- [x] 8.6 Run `pnpm typecheck` and fix any errors
- [x] 8.7 Run `pnpm lint` and fix any errors
- [x] 8.8 Run `pnpm test` and fix any failures
- [x] 8.9 Run `pnpm test:e2e` and fix any failures
- [x] 8.10 Kill any vitest worker processes

## 9. Lockfile evolution for registry sources

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (SourceInput types).

- [x] 9.1 Evolve `RegistryLockEntrySchema` — rename `version` to `resolvedVersion` (required), add `checksum: string`, add `sourceName: string`
- [x] 9.2 Update `sourceToLockEntry` in `source-to-lock-entry.ts` — registry case emits `checksum`, `resolvedVersion`, `sourceName`
- [x] 9.3 Update lockfile schema tests for new registry entry shape
- [x] 9.4 Update `source-to-lock-entry` tests for registry case
- [x] 9.5 Run `pnpm typecheck` and fix any errors
- [x] 9.6 Run `pnpm lint` and fix any errors
- [x] 9.7 Run `pnpm test` and fix any failures
- [x] 9.8 Kill any vitest worker processes

## 10. Ambiguous resolution via getSources

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5 (workspace getSources), Phase 8 (SourceProviders service).

- [x] 10.1 Refactor `resolution/resolvers/ambiguous.ts` — replace hardcoded GitHub → GitLab → Bitbucket try-order with iteration over `getSources()` filtered to git-hosting types
- [x] 10.2 Remove `resolveSlashPattern` from `sources/parser.ts` — ambiguous resolution moves to resolver layer
- [x] 10.3 Add `WorkspaceContext` dependency to the ambiguous resolver
- [x] 10.4 Update ambiguous resolver tests — default order preserved, user-customized order, multiple sources of same type, explicit prefix bypasses ordering
- [x] 10.5 Run `pnpm typecheck` and fix any errors
- [x] 10.6 Run `pnpm lint` and fix any errors
- [x] 10.7 Run `pnpm test` and fix any failures
- [x] 10.8 Run `pnpm test:e2e` and fix any failures
- [x] 10.9 Kill any vitest worker processes

## 11. Registry guard

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5 (workspace getRegistrySources, addSource).

- [x] 11.1 Implement `registryGuard` shared function — check `getRegistrySources()`, prompt in interactive mode (path input, persist as `{ name: "local", source: "registry", location: "<path>" }`), fail with `RegistryNotConfiguredError` in non-interactive mode
- [x] 11.2 Define `RegistryNotConfiguredError` tagged error
- [x] 11.3 Write tests for registry guard — interactive prompt + persist, non-interactive error, already configured passes, guard changes visible to subsequent calls
- [x] 11.4 Run `pnpm typecheck` and fix any errors
- [x] 11.5 Run `pnpm lint` and fix any errors
- [x] 11.6 Run `pnpm test` and fix any failures
- [x] 11.7 Kill any vitest worker processes

## 12. Install handler migration to SourceProviders

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 8 (SourceProviders service), Phase 9 (lockfile evolution), Phase 11 (registry guard).

- [ ] 12.1 Refactor `skills install` handler to use `SourceProviders` service — `yield* SourceProviders`, call `sources.resolve()` and `sources.fetch()`
- [ ] 12.2 Add registry guard call when `source.source === "registry"`
- [ ] 12.3 Update `installSkill` operation executor — conditional canonical path (`.axm/extensions/` for registry, `.agents/skills/` for others), pre-clean from all known locations, registry lockfile fields (`checksum`, `resolvedVersion`, `sourceName`)
- [ ] 12.4 Remove `discover-skills.ts` — discovery logic now lives in source provider implementations
- [ ] 12.5 Update install handler tests for SourceProviders integration
- [ ] 12.6 Update `installSkill` executor tests for conditional path and registry lockfile fields
- [ ] 12.7 Run `pnpm typecheck` and fix any errors
- [ ] 12.8 Run `pnpm lint` and fix any errors
- [ ] 12.9 Run `pnpm test` and fix any failures
- [ ] 12.10 Run `pnpm test:e2e` and fix any failures
- [ ] 12.11 Kill any vitest worker processes

## 13. Uninstall handler update

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 12 (install handler migration establishes new canonical locations).

- [ ] 13.1 Update `skills uninstall` handler — read lockfile entry's `source` to determine cleanup location (`.axm/extensions/` for registry, `.agents/skills/` for others)
- [ ] 13.2 Update uninstall handler tests
- [ ] 13.3 Run `pnpm typecheck` and fix any errors
- [ ] 13.4 Run `pnpm lint` and fix any errors
- [ ] 13.5 Run `pnpm test` and fix any failures
- [ ] 13.6 Run `pnpm test:e2e` and fix any failures
- [ ] 13.7 Kill any vitest worker processes

## 14. New operation types (ForkSkill + PublishSkill)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 6 (SourceInput, SkillRef evolution).

- [ ] 14.1 Define `ForkSkillArgs` and `ForkSkillOperation` types in `operations.ts`
- [ ] 14.2 Define `PublishSkillArgs` and `PublishSkillOperation` types in `operations.ts`
- [ ] 14.3 Implement `forkSkill` operation executor — copy source files to `.axm/extensions/@<scope>/skills/<name>/`, generate `axm-skill.json` manifest with defaults (version `0.1.0`, agents from settings, empty dependencies)
- [ ] 14.4 Implement `publishSkill` operation executor — read manifest, build zip, compute SHA-256, call `provider.publishVersion`, handle idempotency
- [ ] 14.5 Write tests for `forkSkill` executor — file copy, manifest generation, default values
- [ ] 14.6 Write tests for `publishSkill` executor — archive creation, checksum computation, index creation/update, idempotency (same checksum no-op, different checksum error)
- [ ] 14.7 Run `pnpm typecheck` and fix any errors
- [ ] 14.8 Run `pnpm lint` and fix any errors
- [ ] 14.9 Run `pnpm test` and fix any failures
- [ ] 14.10 Kill any vitest worker processes

## 15. Skills fork command

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 8 (SourceProviders), Phase 11 (registry guard), Phase 14 (fork/publish operations).

- [ ] 15.1 Create `commands/skills/fork/command.ts` — yargs definition with source argument, `--yes`/`--preview` flags
- [ ] 15.2 Create `commands/skills/fork/handler.ts` — registry guard, resolve input (glob/installed/source), scope resolution, uniqueness check, build plan with 3 sequential ops (fork → publish → install), execute via `resolvePlan`
- [ ] 15.3 Register fork subcommand under `skills` command
- [ ] 15.4 Write command parsing tests for `skills fork`
- [ ] 15.5 Write handler tests — single skill fork flow, glob-based batch fork, scope resolution, uniqueness collision prompt
- [ ] 15.6 Run `pnpm typecheck` and fix any errors
- [ ] 15.7 Run `pnpm lint` and fix any errors
- [ ] 15.8 Run `pnpm test` and fix any failures
- [ ] 15.9 Run `pnpm test:e2e` and fix any failures
- [ ] 15.10 Kill any vitest worker processes

## 16. Skills publish command

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 11 (registry guard), Phase 14 (publish operation).

- [ ] 16.1 Create `commands/skills/publish/command.ts` — yargs definition with extension argument, `--registry` flag, `--yes`/`--preview` flags
- [ ] 16.2 Create `commands/skills/publish/handler.ts` — registry guard, scope resolution for bare names, validate managed extension exists, build `PublishSkillOperation`, execute via `resolvePlan`
- [ ] 16.3 Register publish subcommand under `skills` command
- [ ] 16.4 Write command parsing tests for `skills publish`
- [ ] 16.5 Write handler tests — publish with explicit registry, default registry, bare name scope resolution, missing manifest error, non-managed skill error
- [ ] 16.6 Run `pnpm typecheck` and fix any errors
- [ ] 16.7 Run `pnpm lint` and fix any errors
- [ ] 16.8 Run `pnpm test` and fix any failures
- [ ] 16.9 Run `pnpm test:e2e` and fix any failures
- [ ] 16.10 Kill any vitest worker processes

## 17. E2E tests

> **Subagent:** Run this entire phase in a single subagent.

Depends on: all previous phases.

- [ ] 17.1 Write E2E test: `skills install` from a local registry (set up temp registry with published extension, install, verify files in `.axm/extensions/`, verify lockfile with `resolvedVersion`/`checksum`/`sourceName`)
- [ ] 17.2 Write E2E test: `skills fork` from an installed skill (install from git, fork to local registry, verify managed extension in `.axm/extensions/`, verify published in registry, verify re-installed from registry)
- [ ] 17.3 Write E2E test: `skills publish` to a local registry (set up managed extension, publish, verify archive and index.json in registry)
- [ ] 17.4 Write E2E test: `skills uninstall` for a registry-sourced skill (install from registry, uninstall, verify cleanup from `.axm/extensions/`)
- [ ] 17.5 Write E2E test: registry guard prompts when no registry configured (verify settings persisted after guard)
- [ ] 17.6 Run `pnpm test:e2e` and fix any failures
- [ ] 17.7 Kill any vitest worker processes

> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Registry domain types and utils

> **Subagent:** Run this entire phase in a single subagent.

Create the shared foundation that both client and host-provider depend on.

- [x] 1.1 Create `registry/utils.ts` with helpers extracted from `sources/providers/registry.ts`: `selectVersion`, `computeChecksum`, `extractZip`, `pluralizeType`, `extensionDir` (path builder)
- [x] 1.2 Define `RegistrySearchOptions` type in `registry/client.ts`: `{ names: ReadonlyArray<string>, agents: ReadonlyArray<string>, type: RegistryExtensionType | "*" }`
- [x] 1.3 Define `RegistryExtensionEntry` type in `registry/client.ts`: `{ scope, type: RegistryExtensionType, name, version, checksum }`
- [x] 1.4 Write tests for extracted utils (`registry/utils.test.ts`): `selectVersion`, `computeChecksum`, `pluralizeType`, `extensionDir`
- [x] 1.5 Run `pnpm typecheck` and fix any errors
- [x] 1.6 Run `pnpm lint` and fix any errors
- [x] 1.7 Run `pnpm test` and fix any failures
- [x] 1.8 Kill any vitest worker processes

## 2. RegistryClient interface and LocalRegistryClient

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [x] 2.1 Define `RegistryClient` interface in `registry/client.ts` with 6 methods: `getExtensions`, `namespaceExists`, `fetchIndex`, `getExtension`, `publishExtension`, `extensionExists`
- [x] 2.2 Write tests for `LocalRegistryClient` in `registry/client.test.ts` — migrate and adapt existing tests from `sources/providers/registry.test.ts` (update to use `RegistrySearchOptions` / `RegistryExtensionEntry` instead of source-domain types, drop scope-scanning tests)
- [x] 2.3 Implement `createLocalRegistryClient(registryRoot: string): RegistryClient` — extract logic from `createLocalRegistryProvider`, return `RegistryExtensionEntry` from `getExtensions`, remove scope-scanning from fetch path
- [x] 2.4 Run `pnpm typecheck` and fix any errors
- [x] 2.5 Run `pnpm lint` and fix any errors
- [x] 2.6 Run `pnpm test` and fix any failures
- [x] 2.7 Kill any vitest worker processes

## 3. RemoteRegistryClient and factory

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2.

- [x] 3.1 Write tests for `RemoteRegistryClient` in `registry/client.test.ts` — all methods fail with "remote registry not yet supported"
- [x] 3.2 Implement `createRemoteRegistryClient(): RegistryClient` — stub all methods with `CliError`
- [x] 3.3 Write tests for `createRegistryClient` factory — local path / `file://` → local, `https://` → remote
- [x] 3.4 Implement `createRegistryClient(location: string): RegistryClient` factory
- [x] 3.5 Update `registry/index.ts` barrel to export: `RegistryClient`, `RegistrySearchOptions`, `RegistryExtensionEntry`, `createRegistryClient`, `createLocalRegistryClient`, `createRemoteRegistryClient`, plus existing schema exports and shared utils
- [x] 3.6 Run `pnpm typecheck` and fix any errors
- [x] 3.7 Run `pnpm lint` and fix any errors
- [x] 3.8 Run `pnpm test` and fix any failures
- [x] 3.9 Kill any vitest worker processes

## 4. Registry host providers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3.

- [x] 4.1 Create `sources/providers/registry/` directory with `host-provider.ts` and `index.ts`
- [x] 4.2 Write tests for `LocalRegistrySourceHostProvider` in `sources/providers/registry/host-provider.test.ts` — test `find` (type mapping: `FindOptions → RegistrySearchOptions`, `RegistryExtensionEntry → SourceExtensionRef`), `fetch` (delegates to client + checksum verification + zip extraction), `publishExtension` (delegates to client)
- [x] 4.3 Implement `LocalRegistrySourceHostProvider` — receives `RegistryClient` at construction, implements `PublishableSourceHostProvider`, maps types at boundary
- [x] 4.4 Write tests for `RemoteRegistrySourceHostProvider` — all operations fail via underlying `RemoteRegistryClient`
- [x] 4.5 Implement `RemoteRegistrySourceHostProvider` — delegates to `RemoteRegistryClient`
- [x] 4.6 Implement `createRegistrySourceHostProvider(host: RegistrySourceHost): PublishableSourceHostProvider` factory — creates appropriate client and wraps in matching host provider
- [x] 4.7 Update `sources/providers/registry/index.ts` barrel to export `createRegistrySourceHostProvider`
- [x] 4.8 Run `pnpm typecheck` and fix any errors
- [x] 4.9 Run `pnpm lint` and fix any errors
- [x] 4.10 Run `pnpm test` and fix any failures
- [x] 4.11 Kill any vitest worker processes

## 5. Migrate consumers and delete old code

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1, 5.2, 5.3, 5.4, 5.5 are independent — launch as parallel subagents.

Depends on: Phase 4.

- [x] 5.1 Update `sources/service.ts` — import `createRegistrySourceHostProvider` from `@/sources/providers/registry`, replace `createRegistryProvider` usage in meta-provider with `createRegistrySourceHostProvider`, call `provider.find`/`provider.fetch` instead of `provider.getExtensions`/`provider.fetch`
- [x] 5.2 Update `sources/resolve-source.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` usage with `createRegistryClient`, call `client.extensionExists`/`client.namespaceExists` directly
- [x] 5.3 Update `cli-commands/skills/publish-skill.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` with `createRegistryClient`
- [x] 5.4 Update `cli-commands/packs/publish/publish-pack.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` with `createRegistryClient`
- [x] 5.5 Update `cli-commands/skills/install/resolve-skill-install-source.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` with `createRegistryClient`
- [x] 5.6 Update `sources/providers/index.ts` barrel — remove `RegistrySourceProvider` type export and old factory re-exports, add re-exports from `./registry/index.js`
- [x] 5.7 Update `sources/index.ts` barrel — remove `RegistrySourceProvider` re-export
- [x] 5.8 Remove `RegistrySourceParams` from `sources/types.ts`
- [x] 5.9 Delete `sources/providers/registry.ts` and `sources/providers/registry.test.ts`
- [x] 5.10 Run `pnpm typecheck` and fix any errors
- [x] 5.11 Run `pnpm lint` and fix any errors
- [x] 5.12 Run `pnpm test` and fix any failures
- [x] 5.13 Run `pnpm test:e2e` and fix any failures
- [x] 5.14 Kill any vitest worker processes

## 6. Final verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5.

- [x] 6.1 Run `pnpm typecheck` — verify clean across all packages
- [x] 6.2 Run `pnpm lint` — verify clean across all packages
- [x] 6.3 Run `pnpm test` — verify all tests pass
- [x] 6.4 Run `pnpm test:e2e` — verify all E2E tests pass
- [x] 6.5 Run `pnpm format` — verify formatting is clean
- [x] 6.6 Kill any vitest worker processes

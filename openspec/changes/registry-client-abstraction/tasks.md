> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Registry domain types and utils

> **Subagent:** Run this entire phase in a single subagent.

Create the shared foundation that both client and host-provider depend on.

- [ ] 1.1 Create `registry/utils.ts` with helpers extracted from `sources/providers/registry.ts`: `selectVersion`, `computeChecksum`, `extractZip`, `pluralizeType`, `extensionDir` (path builder)
- [ ] 1.2 Define `RegistrySearchOptions` type in `registry/client.ts`: `{ names: ReadonlyArray<string>, agents: ReadonlyArray<string>, type: RegistryExtensionType | "*" }`
- [ ] 1.3 Define `RegistryExtensionEntry` type in `registry/client.ts`: `{ scope, type: RegistryExtensionType, name, version, checksum }`
- [ ] 1.4 Write tests for extracted utils (`registry/utils.test.ts`): `selectVersion`, `computeChecksum`, `pluralizeType`, `extensionDir`
- [ ] 1.5 Run `pnpm typecheck` and fix any errors
- [ ] 1.6 Run `pnpm lint` and fix any errors
- [ ] 1.7 Run `pnpm test` and fix any failures
- [ ] 1.8 Kill any vitest worker processes

## 2. RegistryClient interface and LocalRegistryClient

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [ ] 2.1 Define `RegistryClient` interface in `registry/client.ts` with 6 methods: `getExtensions`, `scopeExists`, `fetchIndex`, `getExtension`, `publishExtension`, `extensionExists`
- [ ] 2.2 Write tests for `LocalRegistryClient` in `registry/client.test.ts` — migrate and adapt existing tests from `sources/providers/registry.test.ts` (update to use `RegistrySearchOptions` / `RegistryExtensionEntry` instead of source-domain types, drop scope-scanning tests)
- [ ] 2.3 Implement `createLocalRegistryClient(registryRoot: string): RegistryClient` — extract logic from `createLocalRegistryProvider`, return `RegistryExtensionEntry` from `getExtensions`, remove scope-scanning from fetch path
- [ ] 2.4 Run `pnpm typecheck` and fix any errors
- [ ] 2.5 Run `pnpm lint` and fix any errors
- [ ] 2.6 Run `pnpm test` and fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. RemoteRegistryClient and factory

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2.

- [ ] 3.1 Write tests for `RemoteRegistryClient` in `registry/client.test.ts` — all methods fail with "remote registry not yet supported"
- [ ] 3.2 Implement `createRemoteRegistryClient(): RegistryClient` — stub all methods with `CliError`
- [ ] 3.3 Write tests for `createRegistryClient` factory — local path / `file://` → local, `https://` → remote
- [ ] 3.4 Implement `createRegistryClient(location: string): RegistryClient` factory
- [ ] 3.5 Update `registry/index.ts` barrel to export: `RegistryClient`, `RegistrySearchOptions`, `RegistryExtensionEntry`, `createRegistryClient`, `createLocalRegistryClient`, `createRemoteRegistryClient`, plus existing schema exports and shared utils
- [ ] 3.6 Run `pnpm typecheck` and fix any errors
- [ ] 3.7 Run `pnpm lint` and fix any errors
- [ ] 3.8 Run `pnpm test` and fix any failures
- [ ] 3.9 Kill any vitest worker processes

## 4. Registry host providers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3.

- [ ] 4.1 Create `sources/providers/registry/` directory with `host-provider.ts` and `index.ts`
- [ ] 4.2 Write tests for `LocalRegistrySourceHostProvider` in `sources/providers/registry/host-provider.test.ts` — test `find` (type mapping: `FindOptions → RegistrySearchOptions`, `RegistryExtensionEntry → SourceExtensionRef`), `fetch` (delegates to client + checksum verification + zip extraction), `publishExtension` (delegates to client)
- [ ] 4.3 Implement `LocalRegistrySourceHostProvider` — receives `RegistryClient` at construction, implements `PublishableSourceHostProvider`, maps types at boundary
- [ ] 4.4 Write tests for `RemoteRegistrySourceHostProvider` — all operations fail via underlying `RemoteRegistryClient`
- [ ] 4.5 Implement `RemoteRegistrySourceHostProvider` — delegates to `RemoteRegistryClient`
- [ ] 4.6 Implement `createRegistrySourceHostProvider(host: RegistrySourceHost): PublishableSourceHostProvider` factory — creates appropriate client and wraps in matching host provider
- [ ] 4.7 Update `sources/providers/registry/index.ts` barrel to export `createRegistrySourceHostProvider`
- [ ] 4.8 Run `pnpm typecheck` and fix any errors
- [ ] 4.9 Run `pnpm lint` and fix any errors
- [ ] 4.10 Run `pnpm test` and fix any failures
- [ ] 4.11 Kill any vitest worker processes

## 5. Migrate consumers and delete old code

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1, 5.2, 5.3, 5.4, 5.5 are independent — launch as parallel subagents.

Depends on: Phase 4.

- [ ] 5.1 Update `sources/service.ts` — import `createRegistrySourceHostProvider` from `@/sources/providers/registry`, replace `createRegistryProvider` usage in meta-provider with `createRegistrySourceHostProvider`, call `provider.find`/`provider.fetch` instead of `provider.getExtensions`/`provider.fetch`
- [ ] 5.2 Update `sources/resolve-source.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` usage with `createRegistryClient`, call `client.extensionExists`/`client.scopeExists` directly
- [ ] 5.3 Update `cli-commands/skills/publish-skill.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` with `createRegistryClient`
- [ ] 5.4 Update `cli-commands/packs/publish/publish-pack.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` with `createRegistryClient`
- [ ] 5.5 Update `cli-commands/skills/install/resolve-skill-install-source.ts` — import `createRegistryClient` from `@/registry`, replace `createRegistryProvider` with `createRegistryClient`
- [ ] 5.6 Update `sources/providers/index.ts` barrel — remove `RegistrySourceProvider` type export and old factory re-exports, add re-exports from `./registry/index.js`
- [ ] 5.7 Update `sources/index.ts` barrel — remove `RegistrySourceProvider` re-export
- [ ] 5.8 Remove `RegistrySourceParams` from `sources/types.ts`
- [ ] 5.9 Delete `sources/providers/registry.ts` and `sources/providers/registry.test.ts`
- [ ] 5.10 Run `pnpm typecheck` and fix any errors
- [ ] 5.11 Run `pnpm lint` and fix any errors
- [ ] 5.12 Run `pnpm test` and fix any failures
- [ ] 5.13 Run `pnpm test:e2e` and fix any failures
- [ ] 5.14 Kill any vitest worker processes

## 6. Final verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5.

- [ ] 6.1 Run `pnpm typecheck` — verify clean across all packages
- [ ] 6.2 Run `pnpm lint` — verify clean across all packages
- [ ] 6.3 Run `pnpm test` — verify all tests pass
- [ ] 6.4 Run `pnpm test:e2e` — verify all E2E tests pass
- [ ] 6.5 Run `pnpm format` — verify formatting is clean
- [ ] 6.6 Kill any vitest worker processes

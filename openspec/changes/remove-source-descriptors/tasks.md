> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Refactor printer.ts

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Replace descriptor imports with direct `print` function imports in `printer.ts` (see design §3)
- [x] 1.2 Run `pnpm typecheck` and fix any errors
- [x] 1.3 Run `pnpm lint` and fix any errors
- [x] 1.4 Run `pnpm test` and fix any failures
- [x] 1.5 Run `pnpm test:e2e` and fix any failures
- [x] 1.6 Kill any vitest worker processes

## 2. Refactor parser.ts

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (printer no longer imports descriptors, reducing blast radius if something breaks).

- [x] 2.1 Replace `SHORTHAND_PREFIXES` set with inline string literal set (`new Set(["github", "gitlab", "bitbucket"])`)
- [x] 2.2 Replace `ShorthandInput` match arm — switch on prefix, call provider `parseShorthand` directly (see design §1)
- [x] 2.3 Replace `UrlInput` match arm — switch on `url.hostname`, call provider `parseUrl` directly (see design §1)
- [x] 2.4 Replace `GitScpAddress` match arm — switch on `scp.host`, call provider `parseScp` directly (see design §1)
- [x] 2.5 Remove `ALL_DESCRIPTORS`, `DESCRIPTOR_BY_PREFIX`, `DESCRIPTOR_BY_HOSTNAME`, `AnySourceDescriptor`, and all descriptor imports
- [x] 2.6 Remove `SourceDescriptor` import from `parser.ts`
- [x] 2.7 Run `pnpm typecheck` and fix any errors
- [x] 2.8 Run `pnpm lint` and fix any errors
- [x] 2.9 Run `pnpm test` and fix any failures
- [x] 2.10 Run `pnpm test:e2e` and fix any failures
- [x] 2.11 Kill any vitest worker processes

## 3. Refactor resolve-source.ts

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2 (parser no longer uses descriptors).

- [x] 3.1 Replace `tryConfigNameParse` descriptor lookup with switch on `matchedConfig.source` calling provider `parseShorthand` directly (see design §2)
- [x] 3.2 Add `getCanonicalUrlParsers` helper function (see design §2)
- [x] 3.3 Replace `tryUrlHostnameMatch` descriptor usage with `getCanonicalUrlParsers` call
- [x] 3.4 Remove `DESCRIPTOR_BY_TYPE`, `AnySourceDescriptor`, and all descriptor imports from `resolve-source.ts`
- [x] 3.5 Remove `SourceDescriptor` import from `resolve-source.ts`
- [x] 3.6 Run `pnpm typecheck` and fix any errors
- [x] 3.7 Run `pnpm lint` and fix any errors
- [x] 3.8 Run `pnpm test` and fix any failures
- [x] 3.9 Run `pnpm test:e2e` and fix any failures
- [x] 3.10 Kill any vitest worker processes

## 4. Delete descriptor files and clean up dead code

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1, 2, 3 (all consumers refactored — no remaining descriptor references).

> **Parallelization:** Tasks 4.1, 4.2, 4.3, 4.4 are independent — can be done in any order.

- [x] 4.1 Delete `github/descriptor.ts`, `gitlab/descriptor.ts`, `bitbucket/descriptor.ts`, `azurerepos/descriptor.ts`, `local/descriptor.ts`
- [x] 4.2 Remove `descriptor` re-exports from provider `index.ts` files (`github/index.ts`, `gitlab/index.ts`, `bitbucket/index.ts`, `azurerepos/index.ts`, `local/index.ts`)
- [x] 4.3 Remove `shorthandPrefix` constants from `github/shorthand.ts`, `gitlab/shorthand.ts`, `bitbucket/shorthand.ts` and their re-exports from provider `index.ts` files
- [x] 4.4 Remove `SourceDescriptor`, `ShorthandDescriptor`, `UrlParseDescriptor` interfaces from `sources/types.ts`
- [x] 4.5 Update `RegistrySourceInput` doc comment — remove "Location resolved from SourceDescriptor at runtime"
- [x] 4.6 Run `pnpm typecheck` and fix any errors
- [x] 4.7 Run `pnpm lint` and fix any errors
- [x] 4.8 Run `pnpm test` and fix any failures
- [x] 4.9 Run `pnpm test:e2e` and fix any failures
- [x] 4.10 Kill any vitest worker processes

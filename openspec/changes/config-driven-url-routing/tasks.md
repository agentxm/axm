> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Parameterize provider URL/SCP parsers

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.1, 1.2, 1.3, 1.4 are independent — launch as parallel subagents.

Add a `hostname` parameter (defaulting to the canonical hostname) to each provider's `parseUrl` and `parseScp` functions so they work with custom-hosted instances without URL rewriting.

- [ ] 1.1 Update `github/url.ts`: add `hostname = "github.com"` parameter to `parseUrl`, build regex dynamically or match against the parameter. Update `github/scp.ts` similarly for `parseScp`. Update existing tests.
- [ ] 1.2 Update `gitlab/url.ts`: add `hostname = "gitlab.com"` parameter to `parseUrl`. Update `gitlab/scp.ts` similarly for `parseScp`. Update existing tests.
- [ ] 1.3 Update `bitbucket/url.ts`: add `hostname = "bitbucket.org"` parameter to `parseUrl`. Update `bitbucket/scp.ts` similarly for `parseScp`. Update existing tests.
- [ ] 1.4 Update `azurerepos/url.ts`: add `hostname = "dev.azure.com"` parameter to `parseUrl`. Update `azurerepos/scp.ts` similarly for `parseScp`. Update existing tests.
- [ ] 1.5 Run `pnpm typecheck` and fix any errors
- [ ] 1.6 Run `pnpm lint` and fix any errors
- [ ] 1.7 Run `pnpm test` and fix any failures
- [ ] 1.8 Run `pnpm test:e2e` and fix any failures
- [ ] 1.9 Kill any vitest worker processes

## 2. Add `file://` URL classification in `parseInputPattern`

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Write tests for `file://` URL inputs in `parser.test.ts`: `file:///absolute/path` classified as `FilePathPattern` with extracted pathname
- [ ] 2.2 Update `parseInputPattern` in `parser.ts`: detect `file:` protocol after `Schema.URL` validation, return `FilePathPattern` with `url.pathname` instead of `UrlInput`
- [ ] 2.3 Run `pnpm typecheck` and fix any errors
- [ ] 2.4 Run `pnpm lint` and fix any errors
- [ ] 2.5 Run `pnpm test` and fix any failures
- [ ] 2.6 Run `pnpm test:e2e` and fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. Rewrite `resolveSource` to route from `parseInputPattern`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1, Phase 2

Replace the error-recovery chain (`parseSourceInput` → `tryConfigNameParse` → `tryUrlHostnameMatch`) with a single routing function that uses `parseInputPattern` directly.

- [ ] 3.1 Write tests for the new `resolveSource` URL routing: canonical URL matches built-in default, custom hostname matches user config, hostname match but parse failure continues to next source, no match returns ParseError
- [ ] 3.2 Write tests for the new `resolveSource` SCP routing: same scenarios as URL but with SCP addresses
- [ ] 3.3 Implement `UrlInput` handler in `resolveSource`: iterate configured sources with `Match.type<SourceConfig>()`, `tryParseUrl` helper, `Effect.firstSuccessOf`
- [ ] 3.4 Implement `GitScpAddress` handler in `resolveSource`: same pattern with `tryParseScp` helper
- [ ] 3.5 Implement `ShorthandInput` handler: dispatch to provider shorthand parser by prefix, with config-name fallback via `getConfiguredSources()`
- [ ] 3.6 Move `NameInput` handler (lockfile lookup) from `parseSourceInput` into `resolveSource`
- [ ] 3.7 Move `FilePathPattern`, `RegistryPatternInput`, `SlashPattern` handlers into `resolveSource`
- [ ] 3.8 Run `pnpm typecheck` and fix any errors
- [ ] 3.9 Run `pnpm lint` and fix any errors
- [ ] 3.10 Run `pnpm test` and fix any failures
- [ ] 3.11 Run `pnpm test:e2e` and fix any failures
- [ ] 3.12 Kill any vitest worker processes

## 4. Remove `parseSourceInput` and cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

- [ ] 4.1 Remove `parseSourceInput` function from `parser.ts`
- [ ] 4.2 Remove `rewriteUrl`, `rewriteScp`, `tryUrlHostnameMatch`, `tryConfigNameParse`, `hostnameFromUrl`, `extractInputHostname` from `resolve-source.ts`
- [ ] 4.3 Remove `parseShorthandForSource` from `resolve-source.ts`
- [ ] 4.4 Remove `CANONICAL_HOSTNAME` exports from provider index files (if no longer used externally)
- [ ] 4.5 Update barrel exports in `sources/index.ts`: remove `parseSourceInput`, ensure `parseInputPattern` and `resolveSource` are exported
- [ ] 4.6 Update any other callers of `parseSourceInput` across the codebase to use `resolveSource` or `parseInputPattern` directly
- [ ] 4.7 Run `pnpm typecheck` and fix any errors
- [ ] 4.8 Run `pnpm lint` and fix any errors
- [ ] 4.9 Run `pnpm test` and fix any failures
- [ ] 4.10 Run `pnpm test:e2e` and fix any failures
- [ ] 4.11 Kill any vitest worker processes

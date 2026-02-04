## 1. Update Source Schema

- [ ] 1.1 Update tests for `SourceSchema` in `extension-sources.ts` to expect five literals: github, gitlab, bitbucket, git, registry
- [ ] 1.2 Run tests (expect failure - red phase)
- [ ] 1.3 Update `SourceSchema` literal union in `extension-sources.ts`
- [ ] 1.4 Run typecheck and fix any errors
- [ ] 1.5 Run linting and fix any errors
- [ ] 1.6 Run tests and verify passing
- [ ] 1.7 Kill any vitest worker processes

## 2. Update SourceType and ParsedSource

- [ ] 2.1 Update tests for `SourceType` in `types.ts` to expect five literals
- [ ] 2.2 Run tests (expect failure - red phase)
- [ ] 2.3 Update `SourceType` in `types.ts` to match `SourceSchema` (remove local, direct-url, well-known; add bitbucket)
- [ ] 2.4 Update `ParsedSource` interface if needed for new source types
- [ ] 2.5 Run typecheck and fix any errors
- [ ] 2.6 Run linting and fix any errors
- [ ] 2.7 Run tests and verify passing
- [ ] 2.8 Kill any vitest worker processes

## 3. Add Bitbucket Parsing

- [ ] 3.1 Add tests for Bitbucket HTTPS URL pattern parsing
- [ ] 3.2 Add tests for Bitbucket SSH URL pattern parsing
- [ ] 3.3 Add tests for Bitbucket shorthand pattern parsing (bitbucket:owner/repo)
- [ ] 3.4 Run tests (expect failure - red phase)
- [ ] 3.5 Add `BITBUCKET_HTTPS_PATTERN` regex in `source-parser.ts`
- [ ] 3.6 Add `BITBUCKET_SSH_PATTERN` regex in `source-parser.ts`
- [ ] 3.7 Add `parseBitbucketHttpsUrl` function
- [ ] 3.8 Add `parseBitbucketSshUrl` function
- [ ] 3.9 Update `PREFIXED_SHORTHAND_PATTERN` to include `bitbucket`
- [ ] 3.10 Update `parseSource` to handle Bitbucket URLs and shorthand
- [ ] 3.11 Update `buildCloneUrl` to handle Bitbucket sources
- [ ] 3.12 Update `getOriginFromParsed` to handle Bitbucket sources
- [ ] 3.13 Run typecheck and fix any errors
- [ ] 3.14 Run linting and fix any errors
- [ ] 3.15 Run tests and verify passing
- [ ] 3.16 Kill any vitest worker processes

## 4. Remove Local Source Parsing

- [ ] 4.1 Update tests to expect local path inputs to fail with error
- [ ] 4.2 Run tests (expect failure - red phase)
- [ ] 4.3 Remove `LOCAL_PATH_PATTERN` from `source-parser.ts`
- [ ] 4.4 Remove `parseLocalPath` function from `source-parser.ts`
- [ ] 4.5 Update `parseSource` to remove local path handling
- [ ] 4.6 Update `getOriginFromParsed` to remove local case
- [ ] 4.7 Run typecheck and fix any errors
- [ ] 4.8 Run linting and fix any errors
- [ ] 4.9 Run tests and verify passing
- [ ] 4.10 Kill any vitest worker processes

## 5. Remove Well-Known and Direct-URL

- [ ] 5.1 Update tests to expect non-GitHub/GitLab/Bitbucket URLs to fail or be treated as generic git
- [ ] 5.2 Run tests (expect failure - red phase)
- [ ] 5.3 Remove `parseDirectUrl` function from `source-parser.ts`
- [ ] 5.4 Update `parseSource` to remove direct-url/well-known handling
- [ ] 5.5 Update `getOriginFromParsed` to remove direct-url/well-known cases
- [ ] 5.6 Run typecheck and fix any errors
- [ ] 5.7 Run linting and fix any errors
- [ ] 5.8 Run tests and verify passing
- [ ] 5.9 Kill any vitest worker processes

## 6. Update Downstream Consumers

- [ ] 6.1 Search for usages of `local` source type in codebase
- [ ] 6.2 Update any code that references removed source types
- [ ] 6.3 Update any code that expects the old SourceType union
- [ ] 6.4 Run typecheck and fix any errors
- [ ] 6.5 Run linting and fix any errors
- [ ] 6.6 Run all tests and verify passing
- [ ] 6.7 Kill any vitest worker processes

## 7. Final Verification

- [ ] 7.1 Run full test suite (`pnpm test`)
- [ ] 7.2 Run E2E tests (`pnpm test:e2e`)
- [ ] 7.3 Run typecheck (`pnpm typecheck`)
- [ ] 7.4 Run linting (`pnpm lint`)
- [ ] 7.5 Kill any vitest worker processes

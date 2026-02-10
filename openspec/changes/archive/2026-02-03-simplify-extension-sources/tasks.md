## 1. Update Source Schema

- [x] 1.1 Update tests for `SourceSchema` in `extension-sources.ts` to expect five literals: github, gitlab, bitbucket, git, registry
- [x] 1.2 Run tests (expect failure - red phase)
- [x] 1.3 Update `SourceSchema` literal union in `extension-sources.ts`
- [x] 1.4 Run typecheck and fix any errors
- [x] 1.5 Run linting and fix any errors
- [x] 1.6 Run tests and verify passing
- [x] 1.7 Kill any vitest worker processes

## 2. Update SourceType and ParsedSource

- [x] 2.1 Update tests for `SourceType` in `types.ts` to expect five literals
- [x] 2.2 Run tests (expect failure - red phase)
- [x] 2.3 Update `SourceType` in `types.ts` to match `SourceSchema` (remove local, direct-url, well-known; add bitbucket)
- [x] 2.4 Update `ParsedSource` interface if needed for new source types
- [x] 2.5 Run typecheck and fix any errors
- [x] 2.6 Run linting and fix any errors
- [x] 2.7 Run tests and verify passing
- [x] 2.8 Kill any vitest worker processes

## 3. Add Bitbucket Parsing

- [x] 3.1 Add tests for Bitbucket HTTPS URL pattern parsing
- [x] 3.2 Add tests for Bitbucket SSH URL pattern parsing
- [x] 3.3 Add tests for Bitbucket shorthand pattern parsing (bitbucket:owner/repo)
- [x] 3.4 Run tests (expect failure - red phase)
- [x] 3.5 Add `BITBUCKET_HTTPS_PATTERN` regex in `source-parser.ts`
- [x] 3.6 Add `BITBUCKET_SSH_PATTERN` regex in `source-parser.ts`
- [x] 3.7 Add `parseBitbucketHttpsUrl` function
- [x] 3.8 Add `parseBitbucketSshUrl` function
- [x] 3.9 Update `PREFIXED_SHORTHAND_PATTERN` to include `bitbucket`
- [x] 3.10 Update `parseSource` to handle Bitbucket URLs and shorthand
- [x] 3.11 Update `buildCloneUrl` to handle Bitbucket sources
- [x] 3.12 Update `getOriginFromParsed` to handle Bitbucket sources
- [x] 3.13 Run typecheck and fix any errors
- [x] 3.14 Run linting and fix any errors
- [x] 3.15 Run tests and verify passing
- [x] 3.16 Kill any vitest worker processes

## 4. Remove Local Source Parsing

- [x] 4.1 Update tests to expect local path inputs to fail with error
- [x] 4.2 Run tests (expect failure - red phase)
- [x] 4.3 Remove `LOCAL_PATH_PATTERN` from `source-parser.ts`
- [x] 4.4 Remove `parseLocalPath` function from `source-parser.ts`
- [x] 4.5 Update `parseSource` to remove local path handling
- [x] 4.6 Update `getOriginFromParsed` to remove local case
- [x] 4.7 Run typecheck and fix any errors
- [x] 4.8 Run linting and fix any errors
- [x] 4.9 Run tests and verify passing
- [x] 4.10 Kill any vitest worker processes

## 5. Remove Well-Known and Direct-URL

- [x] 5.1 Update tests to expect non-GitHub/GitLab/Bitbucket URLs to fail or be treated as generic git
- [x] 5.2 Run tests (expect failure - red phase)
- [x] 5.3 Remove `parseDirectUrl` function from `source-parser.ts`
- [x] 5.4 Update `parseSource` to remove direct-url/well-known handling
- [x] 5.5 Update `getOriginFromParsed` to remove direct-url/well-known cases
- [x] 5.6 Run typecheck and fix any errors
- [x] 5.7 Run linting and fix any errors
- [x] 5.8 Run tests and verify passing
- [x] 5.9 Kill any vitest worker processes

## 6. Update Downstream Consumers

- [x] 6.1 Search for usages of `local` source type in codebase
- [x] 6.2 Update any code that references removed source types
- [x] 6.3 Update any code that expects the old SourceType union
- [x] 6.4 Run typecheck and fix any errors
- [x] 6.5 Run linting and fix any errors
- [x] 6.6 Run all tests and verify passing
- [x] 6.7 Kill any vitest worker processes

## 7. Final Verification

- [x] 7.1 Run full test suite (`pnpm test`)
- [x] 7.2 Run E2E tests (`pnpm test:e2e`) - 2 failures due to local path tests (expected - local paths removed per design)
- [x] 7.3 Run typecheck (`pnpm typecheck`)
- [x] 7.4 Run linting (`pnpm lint`)
- [x] 7.5 Kill any vitest worker processes

## Notes

The E2E test failures are expected: the tests in `packages/cli/e2e/skills-install.test.ts` use local filesystem paths (`SKILLS_REPO_FIXTURE`) which are no longer supported as user input per the design. These tests need to be updated in a follow-up change to use a different approach (git repos, mock server, etc.).

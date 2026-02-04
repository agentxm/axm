## 1. Add GitHub API Module

- [x] 1.1 Create `packages/core/src/experimental/skills/github-api.ts` with `GitHubApiError` tagged error class
- [x] 1.2 Add `fetchGitHubTreeHash(owner, repo, ref, path)` function that calls GitHub Trees API
- [x] 1.3 Write tests for `github-api.ts` covering success, not-found, and API error cases
- [x] 1.4 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 1.5 Run linting (`pnpm lint`), fix any errors
- [x] 1.6 Run tests (`pnpm test`), fix any failures
- [x] 1.7 Kill any vitest worker processes

## 2. Update State Reconciliation

- [x] 2.1 Update diff computation in `packages/core/src/experimental/skills/state/pure-functions.ts` to handle GitHub-only hash comparison
- [x] 2.2 Update tests for diff computation to cover: GitHub with hash, GitHub without hash, generic git (always update)
- [x] 2.3 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 2.4 Run linting (`pnpm lint`), fix any errors
- [x] 2.5 Run tests (`pnpm test`), fix any failures
- [x] 2.6 Kill any vitest worker processes

## 3. Update Install Handler

- [x] 3.1 Modify install handler to call `fetchGitHubTreeHash` for GitHub sources instead of local computation
- [x] 3.2 Update handler tests to verify GitHub API is called and hash is stored in lockfile
- [x] 3.3 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 3.4 Run linting (`pnpm lint`), fix any errors
- [x] 3.5 Run tests (`pnpm test`), fix any failures
- [x] 3.6 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 3.7 Kill any vitest worker processes

## 4. Remove Local Hashing Code

- [x] 4.1 Delete `packages/core/src/experimental/skills/folder-hash.ts`
- [x] 4.2 Delete `packages/core/src/experimental/skills/folder-hash.test.ts`
- [x] 4.3 Delete `packages/core/src/experimental/skills/content-hash.ts`
- [x] 4.4 Delete `packages/core/src/experimental/skills/content-hash.test.ts`
- [x] 4.5 Remove any imports/references to deleted modules
- [x] 4.6 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 4.7 Run linting (`pnpm lint`), fix any errors
- [x] 4.8 Run tests (`pnpm test`), fix any failures
- [x] 4.9 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 4.10 Kill any vitest worker processes

## 5. Final Verification

- [x] 5.1 Run full test suite (`pnpm test && pnpm test:e2e`)
- [x] 5.2 Verify lockfile entries use raw GitHub tree SHA (no `sha256:` prefix)
- [x] 5.3 Kill any vitest worker processes

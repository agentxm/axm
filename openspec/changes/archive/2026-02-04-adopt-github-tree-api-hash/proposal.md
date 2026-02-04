## Why

Currently we compute gitTreeHash locally using `simple-git` with a fallback to SHA-256 content hashing for non-git directories. This adds unnecessary complexity. Fetching the tree SHA directly via GitHub's Trees API is simpler and removes local computation overhead.

## What Changes

- **BREAKING**: Remove local content hashing (`sha256:...` format) entirely
- **BREAKING**: Remove hash support for generic `git` sources (non-GitHub)
- **BREAKING**: `gitTreeHash` only available for `github` sources
- Add GitHub Trees API fetching for tree SHA (single API call per repo)
- Local sources always trigger update (no stable identifier) - already specified behavior
- Registry sources use version for change detection (unchanged)

## Capabilities

### New Capabilities

None - this is a simplification, not new functionality.

### Modified Capabilities

- `schema-lockfile`: Clarify gitTreeHash is GitHub-only, remove content hash format
- `skills-state`: Update change detection to only use gitTreeHash for GitHub sources

## Impact

**Code to remove:**

- `packages/core/src/experimental/skills/folder-hash.ts`
- `packages/core/src/experimental/skills/content-hash.ts`
- Related tests

**Code to modify:**

- `packages/core/src/experimental/skills/git.ts` - add `fetchGitHubTreeHash(owner, repo, path)`
- State reconciliation - adjust hash comparison logic
- Install handler - fetch hash from GitHub API instead of computing locally

**Dependencies:**

- No new dependencies (uses native fetch)

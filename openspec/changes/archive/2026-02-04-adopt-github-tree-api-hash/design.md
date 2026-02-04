## Context

Currently `gitTreeHash` is computed locally after cloning:

1. For git repos: `git ls-tree HEAD <subPath>` via simple-git
2. For non-git dirs: SHA-256 content hash (`sha256:...` prefix)

This approach requires the repo to be cloned before computing the hash, adding unnecessary complexity. Fetching the tree SHA via GitHub's Trees API before/during install is simpler.

## Goals / Non-Goals

**Goals:**

- Fetch tree SHA from GitHub Trees API for GitHub sources
- Remove local content hashing entirely
- Simplify codebase by removing folder-hash.ts and content-hash.ts

**Non-Goals:**

- Supporting hash computation for generic git sources (GitLab, etc.)
- Backward compatibility with existing `sha256:...` hashes in lockfiles
- Caching API responses across installs

## Decisions

### 1. Use GitHub Trees API with ref support

**Decision:** Fetch tree SHA via `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1`

**Rationale:**

- Single API call returns all tree entries for the repo
- Can use specific ref (tag, branch, SHA) rather than guessing main/master
- Supports user-specified ref for precise version targeting

**Alternative considered:** Continue computing locally after clone

- Rejected: Adds complexity, requires clone before hash is known

### 2. Hash is optional and GitHub-only

**Decision:** `gitTreeHash` field remains optional, only populated for `github` sources

**Rationale:**

- Local sources have no stable remote identifier (spec already says "always update")
- Registry sources use semver version for change detection
- Generic git sources are rare and can fall back to "always update" behavior

**Alternative considered:** Compute hash locally for non-GitHub sources

- Rejected: Contradicts goal of simplification

### 3. Graceful degradation on API failure

**Decision:** If GitHub API call fails (rate limit, network, etc.), install proceeds with `gitTreeHash: undefined`

**Rationale:**

- Hash is used for change detection, not install correctness
- Missing hash means next update check will reinstall (safe default)
- Avoids blocking installs due to transient API issues

### 4. New module: github-api.ts

**Decision:** Create `packages/core/src/experimental/skills/github-api.ts` with:

- `fetchGitHubTreeHash(owner, repo, ref, path): Effect<string | null, GitHubApiError>`

**Rationale:**

- Separates GitHub API concerns from git CLI operations
- Effect-wrapped for consistency with codebase patterns
- Returns `null` on not-found (folder doesn't exist at path)

## Risks / Trade-offs

**[Risk] GitHub API rate limits** → Unauthenticated: 60 req/hr. For bulk installs, could hit limits.

- Mitigation: Hash fetch is optional; install succeeds without it. Future: add GitHub token support.

**[Risk] Breaking change for existing lockfiles** → Existing `sha256:...` hashes become invalid.

- Mitigation: On next install/update, hash will be refetched from GitHub API. No migration needed.

**[Risk] Generic git sources lose change detection** → Will always reinstall on update check.

- Mitigation: This is acceptable; generic git sources are uncommon. Document behavior.

**[Trade-off] Network dependency** → Requires GitHub API access during install.

- Accepted: Install already requires network for cloning. Hash fetch is non-blocking.

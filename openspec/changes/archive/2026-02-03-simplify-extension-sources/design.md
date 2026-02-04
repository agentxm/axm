## Context

The current source system has five types in the parser (`github`, `gitlab`, `local`, `direct-url`, `well-known`) but only four in the schema (`github`, `git`, `local`, `registry`). This misalignment creates confusion about what sources are actually supported.

Additionally:

- `local` sources add complexity for what is essentially a development workflow concern
- `well-known` and `direct-url` conflate discovery mechanisms with source types
- Bitbucket is a major git hosting platform with no explicit support

Current implementation locations:

- `packages/core/src/experimental/schemas/extension-sources.ts` - `SourceSchema` literal union
- `packages/core/src/experimental/skills/types.ts` - `SourceType` and `ParsedSource`
- `packages/core/src/experimental/skills/source-parser.ts` - parsing logic

## Goals / Non-Goals

**Goals:**

- Consolidate to five git-based source types: `github`, `git`, `bitbucket`, `gitlab`, `registry`
- Remove `local` source type (local development uses different mechanisms)
- Remove `well-known` and `direct-url` source types (these are discovery mechanisms, not sources)
- Align `SourceSchema` and `SourceType` to use the same five values
- Add Bitbucket URL and shorthand parsing

**Non-Goals:**

- Defining how local development will work without `local` sources
- Implementing well-known discovery (separate concern)
- Backward compatibility with existing lockfiles using `local` sources

## Decisions

### 1. Canonical source types

The five source types and their formats:

| Source      | Shorthand                           | URL Pattern                        |
| ----------- | ----------------------------------- | ---------------------------------- |
| `github`    | `github:owner/repo[/path][@ref]`    | `https://github.com/owner/repo`    |
| `gitlab`    | `gitlab:owner/repo[/path][@ref]`    | `https://gitlab.com/owner/repo`    |
| `bitbucket` | `bitbucket:owner/repo[/path][@ref]` | `https://bitbucket.org/owner/repo` |
| `git`       | `git:url[#ref]`                     | -                                  |
| `registry`  | `@scope/name[@version]`             | -                                  |

**Rationale:** All git hosting sources use explicit prefixes. Bare `owner/repo` patterns are checked against GitHub → GitLab → Bitbucket in popularity order, returning matches from any platform where the repository exists.

### 2. Remove local path parsing

Remove `LOCAL_PATH_PATTERN` and `parseLocalPath` from `source-parser.ts`. Inputs like `./path` or `/abs/path` will fail with a clear error.

**Rationale:** Local sources conflate installation with development. Development workflows will use different mechanisms (e.g., symlinking, workspace features).

### 3. Remove well-known and direct-url

Remove these types from `SourceType` and the `parseDirectUrl` function. Non-GitHub/GitLab HTTPS URLs will be treated as generic git sources.

**Rationale:** Well-known is a discovery mechanism (finding skills in a repo), not a source type. Discovery can happen after resolving a git source.

### 4. Add Bitbucket parsing

Add patterns and parsers for Bitbucket:

- HTTPS: `https://bitbucket.org/owner/repo[/src/ref/path]`
- SSH: `git@bitbucket.org:owner/repo.git`
- Shorthand: `bitbucket:owner/repo[/path][@ref]`

**Rationale:** Bitbucket is a major git platform used by enterprises.

### 5. URL translation

URLs from known git hosting platforms are automatically translated to their respective source types:

- `https://github.com/owner/repo` → `github:owner/repo`
- `https://gitlab.com/owner/repo` → `gitlab:owner/repo`
- `https://bitbucket.org/owner/repo` → `bitbucket:owner/repo`
- SSH URLs (`git@github.com:owner/repo.git`) also translate to the appropriate source

**Rationale:** Users can paste URLs directly from their browser. The system normalizes to canonical shorthand form.

### 6. Ambiguous pattern resolution order

Bare `owner/repo` patterns (without explicit prefix) are checked against platforms in popularity order:

1. GitHub (most popular)
2. GitLab
3. Bitbucket

If the repository exists on multiple platforms, return all matches for user selection.

**Rationale:** Most users expect GitHub by default. Checking in popularity order minimizes API calls while still supporting all platforms.

### 7. Unify SourceSchema and SourceType

Both `SourceSchema` (in `extension-sources.ts`) and `SourceType` (in `types.ts`) should define the same five literals. Consider deriving `SourceType` from `SourceSchema.Type`.

**Rationale:** Single source of truth prevents drift.

## Risks / Trade-offs

- **Breaking change for local sources** → Users with `local:` entries in lockfiles will get errors. Acceptable given non-goal of backward compatibility.
- **Loss of well-known discovery** → This is intentional; well-known becomes a separate discovery phase, not a source type.
- **Bitbucket URL patterns differ** → Bitbucket uses `/src/ref/path` instead of `/tree/ref/path`. Need careful regex.

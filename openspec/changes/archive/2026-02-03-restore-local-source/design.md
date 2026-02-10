## Context

The `simplify-extension-sources` change removed local path support from the implementation, but the specs in `openspec/specs/` still define local path behavior. This created a spec-implementation mismatch. Local paths are essential for development workflows—testing skills before publishing, using private skills, and iterating during development.

Current implementation has 5 source types: `github`, `gitlab`, `bitbucket`, `git`, `registry`.
Specs define 4 types: `github`, `git`, `local`, `registry`.

This change restores `local` to the implementation. The gitlab/bitbucket discrepancy is a separate concern.

## Goals / Non-Goals

**Goals:**

- Restore `local` as a valid source type
- Recognize paths starting with `./`, `../`, `/`, `~/`, or Windows drive letters
- Allow bare paths in settings: `{ "skill-name": "~/path" }` (no `local:` prefix required)
- Local paths take precedence in ambiguous resolution
- Expand `~` to user's home directory

**Non-Goals:**

- Reconciling gitlab/bitbucket presence in code vs absence in spec (separate change)
- Network-based path resolution (local means local filesystem only)
- Symlink handling beyond what the OS provides

## Decisions

### 1. Bare paths as input, `local:` as canonical format

**Decision:** Accept bare paths (`~/path`, `./path`) as input but normalize to `local:path` internally.

**Rationale:** Matches how `owner/repo` is accepted but normalized to `github:owner/repo`. Users get convenient shorthand while the system maintains a consistent canonical representation.

**Alternatives:**

- Require `local:` prefix everywhere → rejected, too verbose for common dev workflow
- Store bare paths as-is → rejected, harder to distinguish from other patterns programmatically

### 2. Home directory expansion with `~`

**Decision:** Expand `~` to user's home directory at resolution time, not parse time.

**Rationale:** The parsed source retains `~/path` for portability (same settings work across machines). Resolution expands to absolute path.

**Alternatives:**

- Expand at parse time → rejected, loses portability of settings files
- Don't support `~` → rejected, user explicitly requested this

### 3. Local path pattern recognition

**Decision:** Use pattern `/^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/` to recognize local paths.

This matches:

- `./relative` - relative to cwd
- `../parent` - parent directory
- `/absolute` - POSIX absolute
- `~/home` or `~\home` - home directory
- `C:\windows` or `C:/windows` - Windows absolute

**Rationale:** Covers all common local path formats across platforms.

### 4. Restore deleted resolver

**Decision:** Restore `local-path.ts` resolver from git history with minimal modifications (add `~` support).

**Rationale:** The deleted code was well-tested and feature-complete. Restoring is faster and less error-prone than rewriting.

**Alternatives:**

- Rewrite from scratch → rejected, unnecessary when working code exists in git history

## Risks / Trade-offs

**[Risk] Path exists check during parsing** → Mitigation: Only check path format during parsing. Existence validation happens during resolution, which is where filesystem access belongs.

**[Risk] Cross-platform path handling** → Mitigation: Use Node.js `path` module for normalization. The deleted code already handled this correctly.

**[Risk] Settings portability with absolute paths** → Mitigation: Document that `~` paths are portable but absolute paths like `/home/user/...` are machine-specific. This is expected behavior.

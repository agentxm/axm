## Context

The skill install source resolver (`resolveSkillInstallSource`) handles a switch over input pattern types. The `file-path-pattern` case currently returns `SKILL_INSTALL_UNSUPPORTED_INPUT`. All downstream infrastructure for local sources already works:

- `parseInputPattern()` classifies `./path`, `../path`, `/path`, `~/path` as `file-path-pattern`
- `routeFilePathInput()` in `resolve-source.ts` calls `parseLocalPath()` → `LocalSourceParams`
- Local provider discovers skills via `discoverSkillsInDir()`
- `installFromLocal()` copies skill files to workspace
- Lockfile schema supports `LocalLockEntrySchema`
- `sourceToLockEntry()` handles local refs

The only code change is routing `file-path-pattern` through the existing `routeFilePathInput` instead of erroring.

## Goals / Non-Goals

**Goals:**

- Enable `axm skills install ./path` (and `../`, `/`, `~/` variants)
- Use existing local source infrastructure with no new abstractions

**Non-Goals:**

- Glob pattern support (`./skills/*`) — remains unsupported
- Git SCP address support (`user@host:path`) — remains unsupported
- Path validation beyond what `parseLocalPath` already does

## Decisions

### Route file-path-pattern to routeFilePathInput

In `resolveSkillInstallSource`, replace the error case for `file-path-pattern` with a call to `routeFilePathInput(pattern.path)`. This reuses the same function that `resolveSource` already uses for file paths.

**Alternative considered**: Inline `parseLocalPath()` directly. Rejected because `routeFilePathInput` is the established routing function and keeps the pattern consistent with `resolve-source.ts`.

### Keep glob-input and git-scp-address unsupported

These remain blocked. Glob patterns are a different feature (multi-source install). Git SCP is a niche case with no existing infrastructure.

## Risks / Trade-offs

- **[Minimal risk]** The local provider, discovery, install, and lockfile paths are already tested via other flows (e.g., pack install uses local sources). No new edge cases introduced.

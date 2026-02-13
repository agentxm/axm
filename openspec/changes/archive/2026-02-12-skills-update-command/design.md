## Context

Users currently update skills by manually running `axm skills uninstall <name>` followed by `axm skills install <source>`. This loses `installedAt` timestamps and requires remembering the original source. The lockfile already tracks version metadata (`gitTreeHash`, `resolvedVersion`, `ref`) but nothing compares it against the current source state.

The install infrastructure provides a well-established pattern: source resolution → discovery → plan building → plan resolution (display/confirm/apply) → per-skill execution. The update command follows the same architecture with a different entry point: start from the lockfile (what's installed) instead of from a source (what's available).

## Goals / Non-Goals

**Goals:**

- Single command to refresh installed skills from their original sources
- Detect version changes via `gitTreeHash` (git sources), `resolvedVersion` (registry), or always-update (local sources)
- Reuse `installSkill` operation handler for the actual file operations (no duplication)
- Consistent UX: plan-based display/confirm/apply via `ws.resolvePlan()`

**Non-Goals:**

- Pinning or version constraints (e.g., `>=1.2.0`) — update always fetches latest
- Cross-source migration (changing a skill's source type during update)
- Automatic/scheduled update checks

## Decisions

### 1. Reuse `InstallSkillOperation` and `installSkill` handler

**Decision:** The update command builds `InstallSkillOperation`s with `force: true` and dispatches them to the existing `installSkill` handler.

**Rationale:** The per-skill execution logic (sanitize → pre-clean → copy → symlink → lockfile write) is identical for install and update. Creating a separate `UpdateSkillOperation` would duplicate this entire pipeline. The `force: true` flag already bypasses the "already installed" no-op check in the install plan builder.

**Alternative considered:** A dedicated `UpdateSkillOperation` type with its own handler. Rejected because the file operations are identical — the only difference is how the plan is built and what messages are shown.

### 2. Custom `buildUpdatePlan` with version comparison

**Decision:** A new plan builder that compares re-resolved source metadata against lockfile entries. It produces `Plan<InstallSkillOperation>` but with update-specific expected result messages ("Updated X" vs "Installed X") and version-aware no-op detection.

**Version comparison by source type:**

| Source type                                | Changed when                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| github, gitlab, bitbucket, azurerepos, git | `gitTreeHash` differs (content-based). If no hash available, always treat as update. |
| registry                                   | `resolvedVersion` differs                                                            |
| local                                      | Always treat as update (no version tracking)                                         |

### 3. Source reconstruction from settings

**Decision:** Read the source string from `settings.json` (`ws.getInstalledSkills()`) and re-resolve it via `resolveSource()`. The settings store the original source string (e.g., `github:owner/repo#main`), which is exactly what the resolver needs.

**Flow:**

1. `ws.getInstalledSkills()` → `Record<string, string>` (name → source string)
2. `ws.getLockedSkills()` → `Record<string, SkillLockEntry>` (name → locked state)
3. For each skill: `resolveSource(sourceString)` → re-resolve → discover → get new version metadata
4. Compare new metadata against locked entry
5. Build `InstallSkillOperation` for skills with differences

**Alternative considered:** Reconstructing source from lockfile fields. Rejected because the settings already store the canonical source string, which is simpler and more reliable.

### 4. Optional `[source]` positional filters by source match

**Decision:** When `axm skills update [source]` is given a source argument, only update skills whose settings source string matches or is a subset of the given source. When omitted, update all installed skills.

**Matching:** The source argument is resolved via `resolveSource()` and compared against each skill's resolved source. A match means same source type + same identity fields (owner/repo, path, scope/name). This allows `axm skills update owner/repo` to update all skills from that repo.

### 5. `--force` re-installs regardless of version

**Decision:** `--force` bypasses version comparison and marks all matched skills as needing update. This handles cases where content changed without a version/hash change (e.g., local sources, or corrupted local files).

## Risks / Trade-offs

**[Re-resolution is network-dependent]** → Re-resolving git sources requires cloning/fetching. This is the same cost as install and is unavoidable for detecting changes. The spinner provides progress feedback.

**[Local sources always update]** → No version tracking means `axm skills update` with local sources always re-copies files, even if unchanged. This is acceptable — local updates are fast (no network) and `--force` semantics align with user intent.

**[No partial failure recovery]** → If updating 5 skills and skill 3 fails, skills 1-2 are already updated. This matches install behavior and is mitigated by the plan display + confirmation step.

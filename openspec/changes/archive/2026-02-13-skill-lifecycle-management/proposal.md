## Why

Extensions have a binary lifecycle today: installed or not. This creates four gaps:

1. **No disable/enable** — temporarily suspending an extension requires uninstalling it, losing the source reference. Re-enabling means re-discovering and re-adding the source string.
2. **No unmanaged marker** — tools like OpenSpec install extensions programmatically, but `axm update` and `axm uninstall` don't know to leave them alone. There's no way to say "this extension's lifecycle isn't axm's responsibility."
3. **No rename detection** — when a source renames a skill (e.g., fixing a typo from `firbreather` to `firebreather`), the update flow silently fails to find the old name. The user gets no feedback about what happened or how to fix it.
4. **No pack override** — when packs are implemented, users will need a way to disable individual extensions provided by a pack without removing the entire pack.

All four stem from the same root: the settings extension maps are flat `name → source string` values that can't express state, provenance, or overrides.

## Design Rationale

### Type-specific entry schemas with shared concepts

Each extension type gets its own entry schema (`SkillEntry`, `CommandEntry`, etc.) because the identity field differs per type — skills use a `source` string, commands use a `version` specifier. The `enabled` and `managed` flags are shared concepts across all types, but the entry schemas are distinct.

```json
{
  "skills": {
    "firebreather": "github:owner/repo",
    "paused-skill": { "source": "github:owner/repo", "enabled": false }
  },
  "commands": {
    "deploy": "@myorg/deploy-command",
    "legacy-cmd": { "source": "...", "managed": false }
  },
  "mcp-servers": {
    "postgres": "@myorg/pg-server",
    "experimental": { "source": "...", "enabled": false }
  }
}
```

Users have the same mental model and CLI verbs (`enable`/`disable`/`rename`) regardless of extension type, even though the underlying entry shapes may differ.

### Why inline entries, not a separate disabled list

An alternative (used by Gemini CLI) is a separate `disabled` array alongside the extension map:

```json
{
  "skills": { "enabled": true, "disabled": ["skill-a", "skill-b"] }
}
```

We chose inline entries instead because:

- **Single source of truth** — everything about an extension (source, enabled state, managed flag) lives in one entry. No cross-referencing between the extension map and a disabled list.
- **`managed` needs the same surface** — a separate `unmanaged` array would be a third place to look. Inline entries keep all metadata together.
- **Pack overrides are natural** — `{ "enabled": false }` without a `source` is a clear override. A disabled-list approach would need to distinguish "disabled because the user chose to" from "disabled as a pack override."
- **Backwards compatible** — string values continue to work unchanged. The object form is opt-in.

### String collapse on enable

When enabling a skill, the entry collapses back to a plain string **only when all optional fields are at their defaults** (`enabled: true`, `managed: true`). If any non-default flag is set (e.g., `managed: false`), the object form is preserved to avoid losing metadata.

### Lifecycle vs access policy — two distinct concerns

This proposal addresses **extension lifecycle**: enable/disable (user intent) and managed/unmanaged (ownership). A separate concern — **access policy** (allow/block) — governs what extensions are _permitted_ at an organizational level.

These are orthogonal:

| Policy  | Lifecycle | Result                     |
| ------- | --------- | -------------------------- |
| Allowed | Enabled   | Active                     |
| Allowed | Disabled  | Inactive (user choice)     |
| Blocked | Enabled   | Inactive (policy override) |
| Blocked | Disabled  | Inactive                   |

Access policy is especially critical for MCP servers (which execute arbitrary code) and could look like:

```json
{
  "policy": {
    "mcp-servers": { "allow": ["@approved-org/*"] },
    "skills": { "allow": ["@myorg/*", "@community/*"] }
  }
}
```

Policy is **out of scope** for this proposal. It has a different audience (org admins vs individual developers), may live in a separate managed file, and composes cleanly with the lifecycle model. A user can't enable something policy blocks, but policy doesn't force-enable things — it sets the boundary.

### Disable/enable and the two-layer file model

Disabling an extension removes it from agent directories but **preserves canonical content**:

- **Registry sources**: canonical content stays in `.axm/extensions/`. Agent symlinks are removed. Re-enable recreates symlinks instantly — no network needed.
- **Local sources**: agent symlinks are removed. The local path still exists. Re-enable recreates symlinks instantly.
- **GitHub/git sources**: content lives in agent directories (no separate canonical location today). Disabling removes it. Re-enable triggers a re-resolve and re-install from the lockfile's source coordinates — same as a fresh install.

The primary value of disable over uninstall is preserving the settings entry (source reference, flags, lockfile state) so re-enable doesn't require re-discovery. For git sources, the trade-off is a re-download on re-enable; for registry and local sources, re-enable is instant.

### Rename detection scope

Rename detection applies to source-controlled extension types where the name comes from content inside the source (skills, commands). MCP servers likely have a different identity model and may not need rename detection.

For sources that provide a single extension, rename detection is unambiguous — the one extension that was there is now named differently. For multi-extension sources (e.g., a GitHub repo with many skills), we don't guess — we report the missing extension and list what the source now provides, letting the user decide.

### Pack override persistence

Pack overrides (e.g., `"ice-breath": { "enabled": false }`) are **user intent, not derived state**. They persist even if the providing pack is removed. This avoids surprise behavior when a pack is temporarily removed and re-added — the user's overrides remain in effect. Orphaned overrides are harmless (they apply to nothing) and valuable when the pack returns.

## What Changes

### Enrich skill entries in settings

Skill values in settings become either a string (current behavior) or a `SkillEntry` object with optional metadata:

```json
{
  "skills": {
    "active-skill": "github:owner/repo",
    "paused-skill": { "source": "github:owner/repo", "enabled": false },
    "external-skill": { "source": "local:./skills/external", "managed": false }
  }
}
```

- **String value** — equivalent to `{ "source": "<value>", "enabled": true, "managed": true }`. No behavior change for existing settings files.
- `source` — the source string (same formats as today: registry, GitHub, git, local). Optional when the entry is a pack override.
- `enabled` (default: `true`) — when `false`, the extension is removed from agent directories but remains in settings and lockfile. Toggled via `enable`/`disable` subcommands.
- `managed` (default: `true`) — when `false`, `axm update` and uninstall skip this extension unless `--force` is passed. Indicates the extension's lifecycle is not axm's responsibility.

Other extension types (`commands`, `mcp-servers`) follow the same pattern with their own entry types when those extension types are implemented.

### Pack overrides via skill entries

A skill entry without a `source` acts as an override for a skill provided by a pack:

```json
{
  "packs": { "dragon-pack": "@myorg/dragon-pack" },
  "skills": {
    "ice-breath": { "enabled": false }
  }
}
```

Resolution order: packs expand their skill lists, then skill-level overrides apply, producing the final set. Overrides persist independently of pack lifecycle.

### Rename support

Two flows, same underlying operation:

**Manual rename** — `axm skills rename <old-name> <new-name>`:

- User-initiated, works anytime
- Updates the settings key, lockfile key, and agent directory name
- Useful for fixing names, avoiding conflicts, or aligning with upstream changes without waiting for an update

**Detected rename during update** — when `axm skills update` re-resolves a source and the expected skill name is not found:

1. For **single-skill sources** (the source provides exactly one skill): the update plan shows a rename operation — `firbreather → firebreather` — with the source and version info. The user confirms via the normal plan flow.
2. For **multi-skill sources** (GitHub repos with multiple skills): the update reports the missing skill and lists available skills from that source. No automatic rename inference. The user runs `axm skills rename <old> <new>` to update the mapping.
3. For **subpath sources** (e.g., `github:owner/repo/skills/firbreather`): the source path itself is broken. The update reports a resolution failure with a clear error. The user manually updates the source string in settings.

Both flows perform the same operations:

- Update the settings key from old name to new name
- Update the lockfile key
- Remove the old skill directory from agents
- Install the new skill content under the new name

### New CLI commands

Uniform across extension types:

- `axm <type> enable <name>` — sets `enabled: true` (collapses to string form when all flags are defaults)
- `axm <type> disable <name>` — sets `enabled: false`, removes from agent directories
- `axm <type> rename <old-name> <new-name>` — updates settings key, lockfile key, and installed files

Where `<type>` is `skills` (and later `commands`, `mcp-servers`).

### Update and uninstall behavior changes

- `update` skips extensions with `managed: false` (logs a skip message)
- `update` skips extensions with `enabled: false` (no point updating what isn't active)
- `uninstall` warns on `managed: false` extensions unless `--force`

## Capabilities

### New Capabilities

- `skill-entry-schema`: `SkillEntry` type — `string | { source?, enabled?, managed? }` — for the enriched skill entry in settings
- `cli-skills-enable-disable`: Enable/disable subcommands that toggle the `enabled` flag, add/remove agent directory files, and normalize the settings entry
- `cli-skills-rename`: Rename subcommand that updates settings key, lockfile key, and agent skill directories. Used both manually and by update rename detection.
- `update-rename-detection`: Resolution-layer logic to detect skill renames during update by comparing discovered skills against locked entries with matching source coordinates

### Modified Capabilities

- `cli-skills-update`: Skip `managed: false` and `enabled: false` skills. Surface rename detection in the update plan.
- `cli-skills-uninstall`: Warn on `managed: false` skills unless `--force`.
- `cli-skills-install`: Normalize string vs `SkillEntry` object when reading/writing settings.
- `skills-update-build-plan`: Add rename step type alongside existing install/no-op steps.

## Impact

- **Settings schema** (`packages/cli/src/settings/schema.ts`): `SkillsMapSchema` value type changes from `String` to `String | SkillEntryObject`. New `SkillEntry` schema type.
- **Settings service**: Read/write helpers handle both string and object entries. Normalization on read (string → canonical object internally). String collapse on write when all flags are defaults.
- **Workspace service**: `setSkill`, `removeSkill`, `getInstalledSkills` adapt to enriched entries.
- **Lockfile**: No schema change. Disabled skills remain in lockfile (preserving install state for re-enable).
- **Update handler** (`packages/cli/src/cli-commands/skills/update/`): Rename detection logic, skip conditions for managed/enabled.
- **Update plan builder**: New rename step type in the plan.
- **Install handler**: Normalize entries on write.
- **Uninstall handler**: Warn on `managed: false`.
- **New command directories**: `skills/enable/`, `skills/disable/`, `skills/rename/`.
- **Existing specs**: `cli-skills-update`, `skills-update-build-plan` need amendment for rename detection and skip conditions.

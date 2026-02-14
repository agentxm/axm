## Why

Extensions have no intentional versioning model. Settings stores bare source strings with no version intent, the lockfile pins exact versions with no way to update within a range, and pack manifest version ranges aren't evaluated during install. There's no way to distinguish "stay current" from "pinned" from "compatible updates," and no way to know whether a skill was installed by the user or by a pack.

## What Changes

- **Version expressions**: Extensions support any valid semver range via the `semver` library. No version is the default (stay current/`*`). Three common forms are recommended: `*`, `^x.y.z`, and `x.y.z`.
- **Version constraint persistence**: User version constraints are persisted in the settings source string (e.g., `@acme/tool@^1.0.0`). Absence of a version means "latest."
- **Constraint-aware resolution**: Version resolution evaluates constraints against available versions using semver range matching, replacing the current "pick newest" behavior.
- **Constraint priority**: User explicit constraints take priority over pack constraints. Pack constraints take priority over wildcard/latest.
- **Multi-constraint resolution**: When multiple packs constrain the same extension, compatible constraints are intersected. Incompatible constraints resolve to the highest with a warning.
- **Update warnings**: `axm update` warns when a pack constraint holds back a user-installed skill that has no version constraint (i.e., the user wants latest but a pack caps it).
- **Pack dependency ownership**: **BREAKING** — Pack dependencies are no longer added to `settings.json`. Settings is purely user intent. Ownership is derived: skill in settings = user-owned, skill in a pack's `resolvedSkills` = pack-owned.
- **Ownership-aware lifecycle**: Uninstalling a skill keeps it on disk if a pack still references it. Uninstalling a pack removes its dependencies unless the user or another pack still references them.
- **Pack authoring defaults**: `axm pack add` defaults to `*` (stay current) instead of `^resolved`. Authors specify constraints inline (`@acme/tool@^1.0.0`) when needed.
- **Pack versioning**: Packs follow the same version constraint model as skills. `axm packs install @acme/starter-pack@^2.0.0` persists the constraint in settings.
- **Pack update cascade**: `axm update` updates both skills and packs. When a pack updates, its manifest is re-read and dependencies are reconciled — new deps installed, removed deps orphan-checked, changed constraints re-resolved.

## Capabilities

### New Capabilities

- `version-constraints`: Version expression model (any valid semver range via `semver` library), constraint priority rules, multi-constraint resolution, and semver range matching.

### Modified Capabilities

- `cli-skills-install`: Persist version constraint from source string into settings. Source string `@acme/tool@^1.0.0` stored as-is.
- `cli-packs-install`: Stop adding pack skill dependencies to settings. Pack deps go to lockfile only (skills lock map + pack lock entry).
- `cli-packs-add`: Default version specifier changes from `^resolved` to `*`. Inline version syntax (`@acme/tool@^1.0.0`) sets explicit constraint.
- `cli-skills-update`: Collect constraints from settings source strings and pack manifests on disk. Apply constraint priority. Resolve highest version within effective constraint. Warn when pack holds back a user's latest-intent skill. Also update packs within their constraints and cascade to pack dependencies.
- `cli-skills-uninstall`: Check pack references before removing. Keep skill in lockfile and on disk if any pack still references it.
- `cli-packs-uninstall`: Existing orphan detection already aligned. Refine to account for constraint-aware ownership model.
- `registry-client`: Evaluate semver range constraints against index.json versions using `semver.satisfies()` instead of always selecting newest.

## Impact

- **Settings schema**: No structural changes. Version constraint is embedded in the existing source string field.
- **Lockfile schema**: No structural changes. Exact resolved versions continue as-is.
- **Pack manifest schema**: No structural changes. Version specifier map already accepts range strings.
- **Breaking**: Pack dependencies no longer appear in settings.json. Existing settings with pack-installed skills will have orphaned entries after upgrade (could be cleaned on next pack install/update).
- **New dependency**: `semver` npm package for range parsing, validation, and matching.
- **Affected code paths**: skill install, pack install, pack add, skill update, skill uninstall, pack uninstall, registry version selection.

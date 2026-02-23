## Why

Workspace extension state is currently modeled with overlapping terms (`managed`, `configured`, `installed`, `unmanaged`) and a special `skills` marker (`managed: false`) that blurs user intent, discovery state, and lifecycle state. This creates inconsistent behavior across commands and makes terminology hard to reason about.

We need a single, strict classification model so workspace behavior is predictable, documentation is coherent, and command logic can rely on non-overlapping categories.

## What Changes

- Introduce a strict workspace extension taxonomy with explicit, non-overlapping lifecycle sets and orthogonal source classification metadata.
- Define source classification as orthogonal metadata:
  - `packagingKind` (`native` | `non-native`)
  - `isBuiltIn` (boolean, implies `native`)
  - `External` as a derived contributor-facing set: all non-native extensions
  - `packs` are native-only
- **BREAKING**: remove `managed: false` from skill entry schema. `settings.skills` will only represent configured managed entries (string/object forms).
- Add ignored pattern support in settings with simple glob matching (`*`) for extension names (for example, `ignored.skills: ["openspec-*"]`).
- Align command behavior and workspace APIs with the new taxonomy so state checks no longer depend on `managed: false` markers.

## Explicit Non-Goal

- Backward compatibility for legacy settings/behavior is not a goal of this change.
- Legacy migration/remediation behavior is out of scope.

### Taxonomy (Normative)

Classification is defined per extension type (`skills`, `commands`, `mcpServers`, `packs`) and per extension key within that type.

#### Core Sets

- `D` (Detected): all extensions discovered from settings, lockfile transitive dependencies, builtin resolution, and workspace/agent scans.
- `I` (Ignored): extensions explicitly marked ignored in settings.
- `E` (Extensions): all unignored detected extensions, `E = D \ I`.
- `C` (Configured): explicit non-ignore entries in settings.
- `P` (Implicit): installed **native** extensions with no settings entry.
- `U` (Unmanaged): detected, unignored, not configured, and not implicit, `U = E \ (C ∪ P)`.
- `Installed`: `C ∪ P`.
- `Managed`: alias of `Installed` (no separate flag).

#### Required Invariants

- `C ∩ P = ∅`
- `U ∩ Installed = ∅`
- `E = C ⊎ P ⊎ U` (disjoint union)
- `Ignored` entries are excluded from all lifecycle classes in `E`
- `P ⊆ { e ∈ E | packagingKind = native }`
- `enabled/disabled` is a state on configured entries only; it does not define lifecycle class

#### Orthogonal Source Classification

- `packagingKind`: `native` | `non-native`
- `isBuiltIn`: boolean
- `isBuiltIn => packagingKind = native`
- For `pack` type: `packagingKind = native` (native-only)
- `External` is derived as `{ e ∈ E | packagingKind = non-native }`

#### Term Mapping

- `Extensions`: `E`
- `Ignored extensions`: `I`
- `Configured`: `C`
- `Implicit`: `P`
- `Installed`: `C ∪ P`
- `Managed`: `Installed`
- `Unmanaged`: `U`
- `Native Extensions`: `{ e ∈ E | packagingKind = native }`
- `External Extensions`: `{ e ∈ E | packagingKind = non-native }`
- `Built-in extensions`: `{ e ∈ E | isBuiltIn = true }`
- `ConfiguredExternalExtensions`: `{ e ∈ C | packagingKind = non-native }`
- `UnmanagedExternalExtensions`: `{ e ∈ U | packagingKind = non-native }`

### Taxonomy (Developer-Friendly)

Use this glossary in contributor-facing docs.

- `Extensions`: all detected extensions except ignored ones.
- `Ignored extensions`: extensions explicitly ignored in settings; ignored items are excluded from normal workspace extension lists and lifecycle classes.
- `Configured`: extensions with explicit non-ignore entries in settings.
- `Implicit`: installed native extensions with no settings entry (typically builtin defaults and pack-provided dependencies).
- `Installed`: everything currently installed (`Configured` + `Implicit`).
- `Managed`: same as `Installed` in this model (there is no separate managed flag).
- `Unmanaged`: detected and not ignored, but neither configured nor implicit installed.
- `Native extensions`: extensions with `packagingKind = native`.
- `External extensions`: extensions with `packagingKind = non-native`.
- `Built-in extensions`: extensions with `isBuiltIn = true` (always native).
- `ConfiguredExternalExtensions`: external extensions that are configured.
- `UnmanagedExternalExtensions`: external extensions that are unmanaged.

Classification notes for contributors:

- First decide lifecycle class (`Configured` vs `Implicit` vs `Unmanaged`).
- Then apply source classification metadata (`packagingKind`, `isBuiltIn`) and derive `External` view from non-native entries.
- `enabled/disabled` is a configured-state flag, not a lifecycle class.
- `settings.skills.<name> = { managed: false }` is removed by this change and must not be used in new behavior.

## Capabilities

### New Capabilities

- `workspace-extension-classification`: Canonical workspace extension taxonomy and invariants (set definitions, disjointness rules, and derived sets used by CLI and workspace services) with an extension-type-agnostic classifier contract that applies to `skills` now and is reusable for `commands`, `mcp-servers`, and `packs`.

### Modified Capabilities

- `skill-entry-schema`: Remove `UnmanagedSkillEntrySchema` and `managed: false` normalization/collapse behavior from skill entry requirements.
- `cli-skills-enable-disable`: Replace unmanaged-marker paths with taxonomy-consistent state validation (configured/installed semantics).
- `cli-skills-rename`: Replace unmanaged-marker validation with taxonomy-consistent rename eligibility rules.
- `cli-skills-uninstall`: Remove unmanaged-marker uninstall shortcut and align behavior to configured/installed/unmanaged discovery model.
- `cli-skills-fork`: Update configured/discovered skill input semantics now that settings no longer stores unmanaged markers.
- `skills-fork`: Align discovery and conflict rules with taxonomy-based unmanaged detection (not settings markers).
- `cli-skills-publish-glob`: Clarify glob expansion against installed skills under the new taxonomy language.

## Impact

- Settings schema and skill entry normalization/collapse behavior (`packages/cli/src/settings/`)
- Workspace classification/query methods (`packages/cli/src/workspace/service.ts`)
- Skills command handlers that branch on `entry.managed` semantics (`enable`, `disable`, `rename`, `uninstall`, `fork`, `publish`)
- Specs and docs that currently reference unmanaged settings markers
- Legacy compatibility behavior is intentionally unspecified and out of scope.

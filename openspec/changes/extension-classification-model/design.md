## Context

Current workspace semantics are split across schema shape, workspace helpers, and command handlers:

- `settings.skills` currently allows `{ managed: false }` via `UnmanagedSkillEntrySchema`.
- `NormalizedSkillEntry` encodes `managed: boolean`, and handlers branch on `entry.managed`.
- `getConfiguredSkills()` returns managed + unmanaged normalized entries.
- `getInstalledSkills()` mixes direct configured skills with transitive pack FQNs from `packs.resolvedSkills`, not from concrete lock entries.
- There is no explicit ignore model in `settings` today.
- Command and MCP settings do not have install-state APIs equivalent to skill `getInstalledSkills()`.

Observed gaps versus the proposal taxonomy:

1. **No `Ignored` representation**: taxonomy defines `I`, code does not.
2. **Unmanaged is encoded, not derived**: `{ managed: false }` in settings conflicts with `U = E \ (C ∪ P)`.
3. **`Managed` is overloaded**: represented as a mutable field instead of derived alias of `Installed`.
4. **Installed identity mismatch**: skills are keyed by short names in settings/lockfile but transitive views use FQN keys.
5. **Cross-type asymmetry**: skills have richer lifecycle logic; commands/MCP/packs are mostly configured-vs-lockfile only.
6. **Spec/test debt**: multiple capability specs and tests explicitly require unmanaged marker behavior.

### Current Workspace Getter Return Shapes (Today)

- `getConfiguredSkills(): Effect.Effect<Record.ReadonlyRecord<string, NormalizedSkillEntry>, CliError>`
- `getInstalledSkills(): Effect.Effect<Record.ReadonlyRecord<string, NormalizedSkillEntry>, CliError>`
- `getConfiguredCommands(): Effect.Effect<NonSkillExtensionsMap, CliError>`
- `getConfiguredMcpServers(): Effect.Effect<NonSkillExtensionsMap, CliError>`
- `getConfiguredPacks(): Effect.Effect<Record.ReadonlyRecord<string, PackEntry>, CliError>`
- `getInstalledPacks(): Effect.Effect<Record.ReadonlyRecord<string, PackEntry>, CliError>`

## Goals / Non-Goals

**Goals:**

- Implement the taxonomy as executable workspace semantics, not docs-only terminology.
- Remove `managed: false` from skill entry schema and runtime model.
- Introduce explicit ignore configuration in settings and classification.
- Make lifecycle classes derived and disjoint (`Configured`, `Implicit`, `Unmanaged`).
- Align skill command behavior (`enable`, `disable`, `rename`, `uninstall`, `update`, `fork`, `publish`) with the new model.

**Non-Goals:**

- Backward compatibility for legacy `managed: false` behavior semantics (marker-based unmanaged flow is intentionally removed).
- Solving same-name multi-namespace key collisions in settings (`skills` keys remain non-FQN short names).
- Full unmanaged disk scanning for commands/MCP/packs in this change (skills-first unmanaged discovery is sufficient for current behavior surface).
- Lockfile schema redesign.

## Decisions

### 1) Replace marker-based unmanaged with explicit ignored sets

Add a top-level `ignored` settings field:

- `ignored.skills`
- `ignored.commands`
- `ignored.packs`
- `ignored["mcp-servers"]`

Each stores ignored extension name patterns for that type.
Patterns support simple glob `*` matching (for example `openspec-*`).
No advanced glob features (`?`, `[]`, `{}`) are supported.

`settings.skills` will support only:

- string source
- object `{ source: string, enabled?: boolean }`

`{ managed: false }` is removed.

Rationale:

- Keeps ignore state explicit and orthogonal to configured entries.
- Matches taxonomy (`I` separate from `C`).
- Avoids reintroducing a second lifecycle signal in each entry union.
- Keeps ignore rules expressive enough for contributor workflows (prefix groups) without adding parser complexity.

Alternatives considered:

- Keep `managed` field but force `true`: rejected (dead state + conceptual ambiguity).
- Add an ignore union arm in each extension entry: rejected (recreates mixed concerns in entry shape).

### Ignore Pattern Semantics

- Matching supports `*` wildcard only.
- Matching is anchored to the full extension name.
- Examples:
  - `openspec-*` matches `openspec-core`
  - `openspec-*` does not match `core-openspec`
- `*` matches any extension name
- Configured-vs-ignored conflicts are validation errors (a configured name cannot match an ignored pattern).
- Classification excludes names that match ignored patterns from `Installed` and `Unmanaged`.
- Ignored implicit/locked entries are not auto-deleted; they remain in lockfile/canonical storage but are excluded from taxonomy sets and CLI flows that operate on `Installed`.
- CLI behavior treats ignored names as not installed for lifecycle operations; removing an ignore pattern re-exposes the extension on next classification read.

### Source Classification (Orthogonal to Lifecycle)

In addition to lifecycle (`Configured` / `Implicit` / `Unmanaged`), classifier output carries source metadata:

- `packagingKind`: `"native"` | `"non-native"`
- `isBuiltIn`: boolean

Invariants:

- `isBuiltIn => packagingKind = "native"`
- **Packs are native-only**: for `type = "pack"`, `packagingKind = "native"` for all entries

Derived sets:

- `Native extensions` = `{ e ∈ E | e.packagingKind = "native" }`
- `Built-in extensions` = `{ e ∈ E | e.isBuiltIn = true }`
- `External extensions` (redefined) = `{ e ∈ E | e.packagingKind = "non-native" }`
- `ConfiguredExternalExtensions` = `{ e ∈ C | e.packagingKind = "non-native" }`
- `UnmanagedExternalExtensions` = `{ e ∈ U | e.packagingKind = "non-native" }`

Notes:

- `External` is a derived contributor-facing view, not a stored source tag.
- This avoids the invalid mutually-exclusive union where `built-in` and `native` could not both apply.

### Error Code Contract

Introduce explicit `CliError` codes for taxonomy validation/classification paths:

- `SETTINGS_IGNORED_CONFIG_CONFLICT` — configured entry matches an ignored pattern.
- `SETTINGS_LEGACY_MANAGED_MARKER` — legacy `{ managed: false }` skill entry found.
- `WORKSPACE_CLASSIFIER_UNSUPPORTED_TYPE` — unsupported/unknown `ExtensionType` passed to classifier adapter.
- `WORKSPACE_EXTENSION_NAME_COLLISION` — implicit→configured promotion detects conflicting configured key/source.

All failures include actionable `howToFix` guidance.

### Effect-style Example: Workspace Classification Getters

```ts
import { Array, Effect, Option } from "effect";
import type { ExtensionType } from "../extensions/common.js";

type ClassifierExtensionType = ExtensionType;
type ExtensionLifecycle = "configured" | "implicit" | "unmanaged";
type PackagingKind = "native" | "non-native";

interface ClassifiedExtension {
  readonly type: ClassifierExtensionType;
  readonly name: string;
  readonly source: Option.Option<string>;
  readonly enabled: boolean;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
  readonly lifecycle: ExtensionLifecycle;
}

interface ClassifierInput {
  readonly type: ClassifierExtensionType;
  readonly configured: Readonly<
    Record<string, { readonly source: Option.Option<string>; readonly enabled: boolean }>
  >;
  readonly lockedNames: ReadonlyArray<string>;
  readonly detectedNames: ReadonlyArray<string>; // [] for command/mcp-server/pack in phase 1
  readonly ignoredPatterns: ReadonlyArray<string>;
  readonly sourceMetaByName: Readonly<
    Record<string, { readonly packagingKind: PackagingKind; readonly isBuiltIn: boolean }>
  >;
}

const toSimpleGlobRegex = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`);
};

const isIgnoredName = (patterns: ReadonlyArray<string>, name: string): boolean =>
  Array.some(patterns, (pattern) => toSimpleGlobRegex(pattern).test(name));

const classifyExtensions = (input: ClassifierInput): ReadonlyArray<ClassifiedExtension> => {
  const sourceMetaFor = (name: string) =>
    input.sourceMetaByName[name] ??
    ({
      packagingKind: input.type === "pack" ? "native" : "non-native",
      isBuiltIn: false,
    } as const);
  const configuredNames = new Set(Object.keys(input.configured));
  const implicitNames = new Set(
    Array.filter(
      input.lockedNames,
      (name) => !configuredNames.has(name) && !isIgnoredName(input.ignoredPatterns, name),
    ),
  );

  const unmanagedNames = Array.filter(
    Array.dedupe(input.detectedNames),
    (name) =>
      !configuredNames.has(name) &&
      !implicitNames.has(name) &&
      !isIgnoredName(input.ignoredPatterns, name),
  );

  const configured = Object.keys(input.configured)
    .sort()
    .map((name) => {
      const entry = input.configured[name]!;
      const sourceMeta = sourceMetaFor(name);
      return {
        type: input.type,
        name,
        source: entry.source,
        enabled: entry.enabled,
        packagingKind: sourceMeta.packagingKind,
        isBuiltIn: sourceMeta.isBuiltIn,
        lifecycle: "configured" as const,
      };
    });

  const implicit = [...implicitNames].sort().map((name) => {
    const sourceMeta = sourceMetaFor(name);
    return {
      type: input.type,
      name,
      source: Option.none<string>(),
      enabled: true,
      packagingKind: sourceMeta.packagingKind,
      isBuiltIn: sourceMeta.isBuiltIn,
      lifecycle: "implicit" as const,
    };
  });

  const unmanaged = unmanagedNames.sort().map((name) => {
    const sourceMeta = sourceMetaFor(name);
    return {
      type: input.type,
      name,
      source: Option.none<string>(),
      enabled: true,
      packagingKind: sourceMeta.packagingKind,
      isBuiltIn: sourceMeta.isBuiltIn,
      lifecycle: "unmanaged" as const,
    };
  });

  return [...configured, ...implicit, ...unmanaged];
};

// Workspace-internal helper by extension type
const getClassifiedExtensions = (type: ClassifierExtensionType) =>
  Effect.gen(function* () {
    const settings = yield* readSettingsSafe(workspaceDir);
    const lockfile = yield* readLockfileSafe(workspaceDir);
    switch (type) {
      case "skill": {
        const detectedNames = yield* detectSkillNamesOnDisk(settings.agents ?? []);
        const configured = normalizeConfiguredSkills(settings.skills ?? {});
        return classifyExtensions({
          type,
          configured: Object.fromEntries(
            Object.entries(configured).map(([name, entry]) => [
              name,
              { source: entry.source, enabled: entry.enabled },
            ]),
          ),
          lockedNames: Object.keys(lockfile.skills),
          detectedNames,
          ignoredPatterns: settings.ignored?.skills ?? [],
          sourceMetaByName: deriveSourceMetaFromSkills(settings, lockfile, detectedNames),
        });
      }
      case "command": {
        const configured = Object.fromEntries(
          Object.entries(settings.commands ?? {}).map(([name, source]) => [
            name,
            { source: Option.some(source), enabled: true },
          ]),
        );
        return classifyExtensions({
          type,
          configured,
          lockedNames: Object.keys(lockfile.commands ?? {}),
          detectedNames: [],
          ignoredPatterns: settings.ignored?.commands ?? [],
          sourceMetaByName: deriveSourceMetaFromCommands(settings, lockfile),
        });
      }
      case "mcp-server": {
        const configured = Object.fromEntries(
          Object.entries(settings["mcp-servers"] ?? {}).map(([name, source]) => [
            name,
            { source: Option.some(source), enabled: true },
          ]),
        );
        return classifyExtensions({
          type,
          configured,
          lockedNames: Object.keys(lockfile["mcp-servers"] ?? {}),
          detectedNames: [],
          ignoredPatterns: settings.ignored?.["mcp-servers"] ?? [],
          sourceMetaByName: deriveSourceMetaFromMcpServers(settings, lockfile),
        });
      }
      case "pack": {
        const configured = normalizeConfiguredPacks(settings.packs ?? {});
        return classifyExtensions({
          type,
          configured,
          lockedNames: Object.keys(lockfile.packs ?? {}),
          detectedNames: [],
          ignoredPatterns: settings.ignored?.packs ?? [],
          sourceMetaByName: deriveSourceMetaFromPacks(settings, lockfile), // always native; built-in when applicable
        });
      }
    }
  });

// Public getters (examples)
const getConfiguredSkills = () =>
  getClassifiedExtensions("skill").pipe(
    Effect.map((rows) =>
      Object.fromEntries(
        rows
          .filter((r) => r.lifecycle === "configured")
          .map((r) => [r.name, { source: r.source, enabled: r.enabled }]),
      ),
    ),
  );

const getInstalledSkills = () =>
  getClassifiedExtensions("skill").pipe(
    Effect.map((rows) => rows.filter((r) => r.lifecycle !== "unmanaged")),
  );

const getInstalledCommands = () =>
  getClassifiedExtensions("command").pipe(
    Effect.map((rows) => rows.filter((r) => r.lifecycle !== "unmanaged")),
  );
```

### 2) Introduce a classification layer in workspace

Add a workspace classification module that derives lifecycle sets from current state.
Design the API to be extension-type-agnostic so the same taxonomy can be applied
to `skills`, `commands`, `mcp-servers`, and `packs`.

For skills:

- `Configured`: settings skills entries (non-ignore).
- `Implicit`: lockfile skills entries missing from settings.
- `Unmanaged`: detected local skills from configured agent skill dirs, excluding configured, implicit, and ignored.
- `Installed`: configured ∪ implicit.

For commands/MCP/packs:

- `Configured`: settings entries.
- `Implicit`: lockfile entries missing from settings.
- `Unmanaged`: empty in this phase (no scan surface needed yet).

`Managed` is derived alias of `Installed` and not stored.

Rationale:

- Centralizes taxonomy logic so handlers no longer infer lifecycle ad hoc.
- Removes dependence on `entry.managed`.
- Makes future extension-type parity incremental.

Extension-agnostic contract (target shape):

- `getConfiguredExtensions(type)`
- `getImplicitExtensions(type)`
- `getUnmanagedExtensions(type)`
- `getInstalledExtensions(type)`
- `getIgnoredExtensions(type)`
- `getExtensions(type)`

where `type` uses the existing `ExtensionType` union:

- `"skill"`
- `"command"`
- `"mcp-server"`
- `"pack"`

Classifier adapters map `ExtensionType` to settings/lockfile keys:

- `"skill"` → `skills`
- `"command"` → `commands`
- `"mcp-server"` → `mcp-servers`
- `"pack"` → `packs`

Classifier output ordering is deterministic:

- sort by extension `name` ascending within each lifecycle bucket
- expose `Configured`, `Implicit`, `Unmanaged`, and `Installed` in that stable order
- map getters preserve insertion order from sorted classifier rows

Phase behavior in this change:

- Implement full lifecycle classification for `skills`.
- Implement configured/implicit/installed/ignored for `commands`, `mcp-servers`, `packs`.
- Keep unmanaged detection for non-skill types empty until those detection surfaces are added.

Alternatives considered:

- Keep existing helper methods and patch callsites directly: rejected (scatters taxonomy rules and risks drift).

#### Required Classifier Unit Tests

Add a dedicated unit test suite for the shared classifier module. Tests must assert normative taxonomy behavior directly (not only through command handlers).

- `configured only` yields configured + installed
- `implicit only` yields implicit + installed
- `configured + implicit` keeps sets disjoint and installed as union
- `ignored exact match` excludes names from installed and unmanaged
- `ignored glob` supports simple `*` with full-name anchoring (`openspec-*` matches `openspec-core`, not `core-openspec`)
- `configured-vs-ignored conflict` returns validation failure with actionable error
- `unmanaged derivation` equals `E \ (C ∪ P)` for skills
- `set invariants` hold: `C ∩ P = ∅`, `U ∩ Installed = ∅`, `E = C ⊎ P ⊎ U`
- `phase behavior` for `"command" | "mcp-server" | "pack"` returns empty unmanaged set in this change
- `extension type coverage` exercises all existing `ExtensionType` variants and verifies classifier adapters use them (no custom classifier-only extension type)
- `deterministic output` repeated classification with same input yields stable output
- `source classification` verifies `packagingKind` / `isBuiltIn` derivation, `isBuiltIn => packagingKind = "native"`, `pack` native-only, and derived `External = E ∩ non-native`

### 3) Naming convention: reserve `*Entry` for persisted types

Use `*Entry` suffix only for persisted schema-backed shapes (for example `SkillEntry`, `PackEntry`,
`SkillLockEntry`, `CommandLockEntry`).

Derived classification/runtime workspace types should not use `Entry` suffix.

Use names like:

- `ConfiguredSkill`
- `ImplicitSkill`
- `UnmanagedSkill`
- `InstalledSkill`
- `ClassifiedSkill`
- `ConfiguredExternalExtensions`
- `UnmanagedExternalExtensions`

Use inline `Record.ReadonlyRecord<string, ...>` for collection return types; avoid `*Map` type aliases.

Rationale:

- Distinguishes persisted JSON/YAML schema types from derived runtime classification sets.
- Prevents leaking old marker-based semantics into new taxonomy types.
- Keeps naming reusable for future extension types (`commands`, `mcp-servers`, `packs`).

### 4) Skill runtime configured/classified shapes drop `managed`

Replace normalized skill entry type used by workspace APIs with configured/installed shapes that do not include `managed`.

Configured skill entry:

- `source: string`
- `enabled: boolean`

Installed skill entry:

- configured entry shape + lifecycle metadata (configured vs implicit) in classifier output.

Rationale:

- `managed` is now derived; storing it in entry payload is redundant and error-prone.

### New Skill Getters and Return Types

```ts
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Record from "effect/Record";

type PackagingKind = "native" | "non-native";

interface ConfiguredSkill {
  readonly source: string;
  readonly enabled: boolean;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

interface ImplicitSkill {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

interface UnmanagedSkill {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

type InstalledSkill =
  | {
      readonly lifecycle: "configured";
      readonly source: string;
      readonly enabled: boolean;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    }
  | {
      readonly lifecycle: "implicit";
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    };

type ClassifiedSkill =
  | ({ readonly lifecycle: "configured" } & {
      readonly source: string;
      readonly enabled: boolean;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    })
  | ({ readonly lifecycle: "implicit" } & {
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    })
  | ({ readonly lifecycle: "unmanaged" } & {
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    });

interface WorkspaceContextService {
  readonly getConfiguredSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSkill>,
    CliError
  >;
  readonly getImplicitSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitSkill>,
    CliError
  >;
  readonly getUnmanagedSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedSkill>,
    CliError
  >;
  readonly getInstalledSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledSkill>,
    CliError
  >;
  readonly getClassifiedSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedSkill>,
    CliError
  >;
  readonly getIgnoredSkillPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;
}
```

### New Command / MCP / Pack Getters and Return Types

```ts
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Record from "effect/Record";

type PackagingKind = "native" | "non-native";

interface ConfiguredExtensionRef {
  readonly source: string;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

interface ImplicitExtensionRef {
  readonly source: Option.Option<string>;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

type InstalledExtensionRef =
  | {
      readonly lifecycle: "configured";
      readonly source: string;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    }
  | {
      readonly lifecycle: "implicit";
      readonly source: Option.Option<string>;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    };

type ClassifiedExtensionRef =
  | {
      readonly lifecycle: "configured";
      readonly source: string;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    }
  | {
      readonly lifecycle: "implicit";
      readonly source: Option.Option<string>;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    }
  | {
      readonly lifecycle: "unmanaged";
      readonly source: Option.Option<string>;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
    };

interface WorkspaceContextService {
  readonly getConfiguredCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getImplicitCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitExtensionRef>,
    CliError
  >;
  readonly getInstalledCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    CliError
  >;
  readonly getClassifiedCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
    CliError
  >;
  readonly getIgnoredCommandPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;

  readonly getConfiguredMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getImplicitMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitExtensionRef>,
    CliError
  >;
  readonly getInstalledMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    CliError
  >;
  readonly getClassifiedMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
    CliError
  >;
  readonly getIgnoredMcpServerPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;

  readonly getConfiguredPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getImplicitPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitExtensionRef>,
    CliError
  >;
  readonly getInstalledPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    CliError
  >;
  readonly getClassifiedPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
    CliError
  >;
  readonly getIgnoredPackPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;
}
```

### 5) Installed skills derive from lockfile + settings (not pack resolved maps)

`getInstalledSkills()` will be derived from:

- direct configured settings entries
- lockfile skill entries absent from settings (implicit)

Pack `resolvedSkills` remains ownership metadata; it is not itself treated as installed source of truth.

Rationale:

- Aligns installed state with concrete materialized records.
- Avoids ghost implicit entries from pack metadata drift.
- Simplifies command behavior and classification invariants.

Trade-off:

- Behavior changes where pack metadata exists without matching lock entries (now treated as not installed).

### 6) Command behavior changes

- `enable/disable/rename`: remove unmanaged-marker validation paths (`SKILL_NOT_MANAGED` checks disappear).
- `disable` for implicit skill continues promotion to direct configured entry (`enabled: false`) but uses classifier-installed state.
- `uninstall`: remove unmanaged-marker shortcut (`Removed unmanaged skill marker ...` path removed).
- `update`: stop unmanaged skip logging; iterate configured entries only, respecting `enabled`.
- `fork` and `resolve-source-pattern`: candidate sets come from detected taxonomy (`E`) and exclude `ignored`.
- `publish` glob expansion continues using installed skills but now through classifier-consistent installed view.

Rationale:

- Every operation reasons over lifecycle sets, not schema marker artifacts.

### 7) Strict rejection of legacy marker entries

On settings read, schema validation fails if any skill entry is `{ managed: false }`.
Failure code: `SETTINGS_LEGACY_MANAGED_MARKER`.

Rationale:

- Matches the change contract: backward compatibility is explicitly out of scope.
- Avoids hidden mutation of user files during read paths.
- Keeps behavior simple and deterministic for contributors.

Alternatives considered:

- Auto-migrate legacy markers to `ignored.skills`: rejected (compatibility behavior not desired for this change).
- Silently drop legacy entries: rejected (implicit data loss).

### 8) Name identity remains short-name keyed (with explicit collision guard)

Settings and lockfile keys remain short names (existing schema constraint).

When promoting implicit registry skills to configured entries:

- detect conflicting existing configured key with different source
- fail with explicit collision error and remediation

Failure code: `WORKSPACE_EXTENSION_NAME_COLLISION`.

Rationale:

- Keeps schema-compatible identity model.
- Makes current limitation explicit instead of silent overwrite.

## Risks / Trade-offs

- **[Risk] Hard break for workspaces still using `managed:false`** → Mitigation: fail fast with clear `SETTINGS_PARSE_FAILED` guidance and remediation text.
- **[Risk] Over-broad ignore glob hides unexpected extensions** → Mitigation: keep glob syntax simple (`*` only), validate conflicts against configured entries, and include matched-name diagnostics in errors/logs.
- **[Risk] Behavioral break for workflows relying on unmanaged markers (fork/uninstall/update tests)** → Mitigation: update command messages/specs/tests in the same change set and add explicit regression coverage for the new ignored model.
- **[Risk] Short-name collisions across namespaces** → Mitigation: add collision checks during implicit→configured promotion and pack unpack; document as known limitation.
- **[Risk] Partial taxonomy parity across extension types (unmanaged scan is skills-first)** → Mitigation: keep generic classifier interfaces; represent non-skill unmanaged as empty for now and track follow-up.
- **[Risk] Drift between settings and lockfile** → Mitigation: installed derivation anchored on lockfile for implicit; keep pack resolved maps for ownership decisions only.
- **[Risk] Broad test fallout** → Mitigation: phase by module and require `pnpm lint`, `pnpm typecheck`, and relevant unit/e2e suites at each phase.

## Migration Plan (Codebase)

1. **Schema foundation**
   - Add `ignored` schema/types and settings key ordering.
   - Add simple glob pattern support (`*`) for ignored entries.
   - Add validation for configured-vs-ignored conflicts (`SETTINGS_IGNORED_CONFIG_CONFLICT`).
   - Remove `UnmanagedSkillEntrySchema` from skill union.
   - Ensure legacy `managed:false` is rejected by schema validation (`SETTINGS_LEGACY_MANAGED_MARKER`).
   - Update settings unit tests.

2. **Workspace classifier**
   - Add extension-type-agnostic lifecycle classification helpers.
   - Use existing `ExtensionType` (`"skill" | "command" | "mcp-server" | "pack"`) with adapter mapping to settings/lockfile keys.
   - Add source metadata derivation (`packagingKind` + `isBuiltIn`) with `pack` native-only invariant and derived `External = E ∩ non-native`.
   - Rebuild skill configured/installed queries on classifier output.
   - Add classifier-backed configured/implicit/installed/ignored getters for `commands`, `mcp-servers`, and `packs` (with unmanaged empty in this phase).
   - Add ignored-aware detection for unmanaged on-disk skills.
   - Add dedicated classifier unit tests for normative taxonomy scenarios, error codes, deterministic ordering, and invariants across all `ExtensionType` values.

3. **Skill command updates**
   - Refactor `enable`, `disable`, `rename`, `uninstall`, `update`, `fork`, `publish`, `resolve-source-pattern`.
   - Remove unmanaged-marker-specific branches/messages.
   - Add collision guard during implicit promotion.

4. **Spec updates**
   - Add new capability spec `workspace-extension-classification`.
   - Update modified specs listed in proposal:
     - `skill-entry-schema`
     - `cli-skills-enable-disable`
     - `cli-skills-rename`
     - `cli-skills-uninstall`
     - `cli-skills-fork`
     - `skills-fork`
     - `cli-skills-publish-glob`

5. **Test and cleanup**
   - Replace unmanaged marker fixtures with ignored fixtures where relevant.
   - Add tests for ignored glob behavior (for example `openspec-*`).
   - Add explicit invalid-legacy-settings tests for `managed:false` rejection.
   - Remove obsolete `managed` assertions.
   - Run `pnpm lint`, `pnpm typecheck`, targeted unit tests, then full test suite.

Rollback approach:

- Code rollback is straightforward (single change set). No automatic settings-file rewrite is introduced by this design.

## Resolved Scope Decisions

- `ignored` remains internal in this change (no new dedicated ignore CLI commands); list/install/update flows consume classifier output and therefore naturally exclude ignored entries.
- Unmanaged discovery remains skills-only in this change; `command` / `mcp-server` / `pack` unmanaged sets stay empty until explicit follow-up detection work.
- Short-name collisions are fail-fast with `WORKSPACE_EXTENSION_NAME_COLLISION`; no interactive rename path in this change.

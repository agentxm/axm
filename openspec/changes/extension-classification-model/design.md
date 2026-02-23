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

- Backward compatibility and migration for legacy `managed: false` settings/behavior.
- Defining dedicated legacy-specific validation paths, error codes, or remediation workflows.
- Solving same-name multi-namespace key collisions in settings (`skills` keys remain non-FQN short names).
- Full unmanaged disk scanning for commands/MCP/packs in this change (skills-first unmanaged discovery is sufficient for current behavior surface).
- Lockfile schema redesign.

## Decisions

### 1) Replace marker-based unmanaged with explicit ignored sets

Add a top-level `ignored` settings field:

- `ignored.skills`
- `ignored.commands`
- `ignored.packs`
- `ignored.mcpServers`

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
- Matching is case-sensitive.
- Leading/trailing whitespace is trimmed; empty patterns after trim are invalid.
- Duplicate patterns are deduplicated after normalization.
- Configured-vs-ignored conflicts are validation errors (a configured name cannot match an ignored pattern).
- Classification excludes names that match ignored patterns from `Installed` and `Unmanaged`.
- Ignored implicit/locked entries are not auto-deleted; they remain in lockfile/canonical storage but are excluded from taxonomy sets and CLI flows that operate on `Installed`.
- CLI behavior treats ignored names as not installed for lifecycle operations; removing an ignore pattern re-exposes the extension on next classification read.
- Invalid ignored patterns fail validation with `SETTINGS_IGNORED_PATTERN_INVALID`.

### Source Classification (Orthogonal to Lifecycle)

In addition to lifecycle (`Configured` / `Implicit` / `Unmanaged`), classifier output carries source metadata:

- `packagingKind`: `"native"` | `"non-native"`
- `isBuiltIn`: boolean

Invariants:

- `isBuiltIn => packagingKind = "native"`
- `Implicit` entries are always native (`packagingKind = "native"`).
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

### Source Metadata Derivation Rules

Source metadata is derived with deterministic precedence:

1. Lockfile entry metadata (highest confidence for installed/implicit entries)
2. Settings source string parsing (for configured entries without lockfile entries)
3. Detection context fallback (skills unmanaged in phase 1)

Rules by extension type:

- `skill`:
  - lockfile `builtin` -> `{ packagingKind: "native", isBuiltIn: true }`
  - lockfile `registry` -> `{ packagingKind: "native", isBuiltIn: false }`
  - lockfile git/local host types -> `{ packagingKind: "non-native", isBuiltIn: false }`
  - configured source parse as registry/FQN -> native
  - configured source parse as git/local shorthand -> non-native
  - unmanaged on-disk fallback -> non-native unless detection context proves canonical axm extension path
- `command` / `mcp-server`:
  - same lockfile/settings rules as skills (builtin/registry => native, git/local => non-native)
- `pack`:
  - always `{ packagingKind: "native" }`
  - `isBuiltIn = true` only when lockfile/source metadata marks builtin

Pack native-only enforcement:

- Enforced in `deriveSourceMetaFromPacks` by construction (always emit native for pack entries).
- No separate user-facing validation path is required for this invariant.
- Classifier unit tests assert the invariant for all classified pack rows.

### Error Code Contract

Introduce explicit `CliError` codes for taxonomy validation/classification paths:

- `SETTINGS_IGNORED_PATTERN_INVALID` — ignored pattern is empty/invalid after normalization.
- `SETTINGS_IGNORED_CONFIG_CONFLICT` — configured entry matches an ignored pattern.
- `WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY` — lockfile-only entry resolves to `packagingKind = "non-native"` (invalid; implicit is native-only).
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
    Record<string, { readonly source: string; readonly enabled: boolean }>
  >;
  readonly lockedNames: ReadonlyArray<string>;
  readonly detectedNames: ReadonlyArray<string>; // phase 1: skills include disk detection; non-skill types pass [] (settings+lockfile are modeled via configured/lockedNames)
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
  const invalidLockfileOnlyNonNative = Array.filter(
    input.lockedNames,
    (name) =>
      !configuredNames.has(name) &&
      !isIgnoredName(input.ignoredPatterns, name) &&
      sourceMetaFor(name).packagingKind !== "native",
  );
  if (invalidLockfileOnlyNonNative.length > 0) {
    throw new Error("WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY");
  }
  const implicitNames = new Set(
    Array.filter(
      input.lockedNames,
      (name) =>
        !configuredNames.has(name) &&
        !isIgnoredName(input.ignoredPatterns, name) &&
        sourceMetaFor(name).packagingKind === "native",
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
        source: Option.some(entry.source),
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
            { source, enabled: true },
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
          Object.entries(settings.mcpServers ?? {}).map(([name, source]) => [
            name,
            { source, enabled: true },
          ]),
        );
        return classifyExtensions({
          type,
          configured,
          lockedNames: Object.keys(lockfile.mcpServers ?? {}),
          detectedNames: [],
          ignoredPatterns: settings.ignored?.mcpServers ?? [],
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
to `skills`, `commands`, `mcpServers`, and `packs`.

For skills:

- `Configured`: settings skills entries (non-ignore).
- `Implicit`: native lockfile skill entries missing from settings.
- `Unmanaged`: detected local skills from configured agent skill dirs, excluding configured, implicit, and ignored.
- `Installed`: configured ∪ implicit.

For commands/MCP/packs:

- `Configured`: settings entries.
- `Implicit`: native lockfile entries missing from settings.
- `Unmanaged`: empty in this phase (no scan surface needed yet).

Phase-1 assumption:

- Non-skill implicit candidates are expected to be native (pack dependencies / builtin sources).
- Non-native lockfile-only entries are invalid in this model and fail fast with `WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY`.

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
- `getIgnoredPatterns(type)`
- `getConfiguredExternalExtensions(type)`
- `getUnmanagedExternalExtensions(type)`
- `getExtensions(type)`

where `type` uses the existing `ExtensionType` union:

- `"skill"`
- `"command"`
- `"mcp-server"`
- `"pack"`

Classifier adapters map `ExtensionType` to settings/lockfile keys:

- `"skill"` → `skills`
- `"command"` → `commands`
- `"mcp-server"` → `mcpServers`
- `"pack"` → `packs`

Classifier output ordering is deterministic:

- sort by extension `name` ascending within each lifecycle bucket
- expose `Configured`, `Implicit`, `Unmanaged`, and `Installed` in that stable order
- map getters preserve insertion order from sorted classifier rows

Phase behavior in this change:

- Implement full lifecycle classification for `skills`.
- Implement configured/implicit/installed/ignored for `commands`, `mcpServers`, `packs`.
- Keep unmanaged detection for non-skill types empty until those detection surfaces are added.

Detected-set construction in phase 1:

- `skill`: `D = keys(settings.skills) ∪ keys(lockfile.skills) ∪ detectedOnDiskSkills`
- `command`: `D = keys(settings.commands) ∪ keys(lockfile.commands)`
- `mcp-server`: `D = keys(settings.mcpServers) ∪ keys(lockfile.mcpServers)`
- `pack`: `D = keys(settings.packs) ∪ keys(lockfile.packs)`

Alternatives considered:

- Keep existing helper methods and patch callsites directly: rejected (scatters taxonomy rules and risks drift).

#### Required Classifier Unit Tests

Add a dedicated unit test suite for the shared classifier module. Tests must assert normative taxonomy behavior directly (not only through command handlers).

- `configured only` yields configured + installed
- `implicit only` yields implicit + installed
- `implicit requires native source metadata` (`packagingKind = "native"`)
- `non-native lockfile-only` returns classifier failure (`WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY`)
- `configured + implicit` keeps sets disjoint and installed as union
- `ignored exact match` excludes names from installed and unmanaged
- `ignored glob` supports simple `*` with full-name anchoring (`openspec-*` matches `openspec-core`, not `core-openspec`)
- `ignored normalization` trims whitespace, rejects empty patterns, and deduplicates duplicates
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
- Keeps naming reusable for future extension types (`commands`, `mcpServers`, `packs`).

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
  readonly getConfiguredExternalSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSkill>,
    CliError
  >;
  readonly getUnmanagedExternalSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedSkill>,
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

type UnmanagedExtensionRef = {
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
  readonly getConfiguredExternalCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getUnmanagedCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >; // empty in phase 1
  readonly getUnmanagedExternalCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
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
  readonly getConfiguredExternalMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getUnmanagedMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >; // empty in phase 1
  readonly getUnmanagedExternalMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
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
  readonly getConfiguredExternalPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >; // expected empty by invariant
  readonly getUnmanagedPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >; // empty in phase 1
  readonly getUnmanagedExternalPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >; // expected empty by invariant
  readonly getIgnoredPackPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;
}
```

### 5) WorkspaceContextService Method Inventory (Delta)

Added methods:

- `getImplicitSkills`, `getUnmanagedSkills`, `getClassifiedSkills`
- `getConfiguredExternalSkills`, `getUnmanagedExternalSkills`
- `getIgnoredSkillPatterns`
- `getImplicitCommands`, `getUnmanagedCommands` (empty in phase 1), `getInstalledCommands`, `getClassifiedCommands`
- `getConfiguredExternalCommands`, `getUnmanagedExternalCommands`
- `getIgnoredCommandPatterns`
- `getImplicitMcpServers`, `getUnmanagedMcpServers` (empty in phase 1), `getInstalledMcpServers`, `getClassifiedMcpServers`
- `getConfiguredExternalMcpServers`, `getUnmanagedExternalMcpServers`
- `getIgnoredMcpServerPatterns`
- `getImplicitPacks`, `getUnmanagedPacks` (empty in phase 1), `getClassifiedPacks`
- `getConfiguredExternalPacks`, `getUnmanagedExternalPacks`
- `getIgnoredPackPatterns`

Updated methods:

- `getConfiguredSkills`: return `Record.ReadonlyRecord<string, ConfiguredSkill>` (no `managed` marker in shape).
- `getInstalledSkills`: return classifier installed set (`configured ∪ implicit`) from settings + native implicit lockfile rows; no transitive pack-only visibility from `resolvedSkills`.
- `setSkillEntry` / `updateSkillEntry`: update to configured-skill shape (no `managed` marker).
- `getConfiguredCommands`: return `Record.ReadonlyRecord<string, ConfiguredExtensionRef>` (includes source metadata).
- `getConfiguredMcpServers`: return `Record.ReadonlyRecord<string, ConfiguredExtensionRef>` and read/write `settings.mcpServers`.
- `getConfiguredPacks`: return `Record.ReadonlyRecord<string, ConfiguredExtensionRef>`.
- `getInstalledPacks`: return classifier installed set (`configured ∪ implicit`) instead of aliasing configured.
  - Behavioral implication: lockfile-only packs (including built-in packs) become implicit-installed in taxonomy views.
- `setMcpServer` / `removeMcpServer`: update settings key usage to `mcpServers` (camelCase).

Removed methods (phase 1):

- None. This phase is additive + return-shape/behavior updates; removals can be considered in a cleanup follow-up after callsites migrate.

Downstream behavioral updates required for changed signatures/semantics:

- `sources/resolve-source.ts` and `sources/resolve-source-pattern.ts` currently treat configured skill source as `Option.Option<string>`; update to configured-skill `source: string` semantics.
- Skill command/operation logic that checks `entry.managed` must switch to lifecycle/classifier checks (`configured` / `implicit` / `unmanaged`) and ignore-set behavior.
- Callers using configured pack values should treat `getConfiguredPacks` as returning typed objects (`ConfiguredExtensionRef`) rather than string-or-object unions.
- Workspace service test doubles must be updated for newly-added getters and changed return payload shapes to prevent false-positive behavior drift in tests.

### 6) Installed skills derive from lockfile + settings (not pack resolved maps)

`getInstalledSkills()` will be derived from:

- direct configured settings entries
- native lockfile skill entries absent from settings (implicit)

Pack `resolvedSkills` remains ownership metadata; it is not itself treated as installed source of truth.

Rationale:

- Aligns installed state with concrete materialized records.
- Avoids ghost implicit entries from pack metadata drift.
- Simplifies command behavior and classification invariants.

Trade-off:

- Behavior changes where pack metadata exists without matching lock entries (now treated as not installed).

### 7) Command behavior changes

- `enable/disable/rename`: remove unmanaged-marker validation paths (`SKILL_NOT_MANAGED` checks disappear).
- `disable` for implicit skill continues promotion to direct configured entry (`enabled: false`) but uses classifier-installed state.
- `uninstall`: remove unmanaged-marker shortcut (`Removed unmanaged skill marker ...` path removed).
- `update`: stop unmanaged skip logging; iterate configured entries only, respecting `enabled`.
- `fork` and `resolve-source-pattern`: candidate sets come from detected taxonomy (`E`) and exclude `ignored`.
- `publish` glob expansion continues using installed skills but now through classifier-consistent installed view.

Rationale:

- Every operation reasons over lifecycle sets, not schema marker artifacts.

### 8) Legacy compatibility is a non-goal

This change does not define compatibility shims, migration logic, or dedicated error handling for legacy marker-based settings shapes.

Rationale:

- Keeps scope focused on the new taxonomy model only.
- Avoids introducing maintenance burden for deprecated shapes.
- Matches explicit project direction: backward compatibility is not a goal.

### 9) Name identity remains short-name keyed (with explicit collision guard)

Settings and lockfile keys remain short names (existing schema constraint).

When promoting implicit registry skills to configured entries:

- detect conflicting existing configured key with different source
- fail with explicit collision error and remediation

Failure code: `WORKSPACE_EXTENSION_NAME_COLLISION`.

Rationale:

- Keeps schema-compatible identity model.
- Makes current limitation explicit instead of silent overwrite.

## Risks / Trade-offs

- **[Risk] Over-broad ignore glob hides unexpected extensions** → Mitigation: keep glob syntax simple (`*` only), validate conflicts against configured entries, and include matched-name diagnostics in errors/logs.
- **[Risk] Behavioral break for workflows relying on unmanaged markers (fork/uninstall/update tests)** → Mitigation: update command messages/specs/tests in the same change set and add explicit regression coverage for the new ignored model.
- **[Risk] Short-name collisions across namespaces** → Mitigation: add collision checks during implicit→configured promotion and pack unpack; document as known limitation.
- **[Risk] Partial taxonomy parity across extension types (unmanaged scan is skills-first)** → Mitigation: keep generic classifier interfaces; represent non-skill unmanaged as empty for now and track follow-up.
- **[Risk] Drift between settings and lockfile** → Mitigation: implicit derivation anchored on native lockfile entries; keep pack resolved maps for ownership decisions only.
- **[Risk] Broad test fallout** → Mitigation: phase by module and require `pnpm lint`, `pnpm typecheck`, and relevant unit/e2e suites at each phase.

## Migration Plan (Codebase)

1. **Schema foundation**
   - Add `ignored` schema/types and settings key ordering.
   - Use camelCase `mcpServers` key in settings and lockfile, and `ignored.mcpServers`.
   - Add simple glob pattern support (`*`) for ignored entries.
   - Add ignored-pattern normalization (trim/dedupe) and invalid-pattern rejection (`SETTINGS_IGNORED_PATTERN_INVALID`).
   - Add validation for configured-vs-ignored conflicts (`SETTINGS_IGNORED_CONFIG_CONFLICT`).
   - Remove `UnmanagedSkillEntrySchema` from skill union.
   - Update settings unit tests.

2. **Workspace classifier**
   - Add extension-type-agnostic lifecycle classification helpers.
   - Use existing `ExtensionType` (`"skill" | "command" | "mcp-server" | "pack"`) with adapter mapping to settings/lockfile keys.
   - Add source metadata derivation (`packagingKind` + `isBuiltIn`) with `pack` native-only invariant and derived `External = E ∩ non-native`.
   - Rebuild skill configured/installed queries on classifier output.
   - Add classifier-backed configured/implicit/installed/ignored getters for `commands`, `mcpServers`, and `packs` (with unmanaged empty in this phase).
   - Expose `ConfiguredExternalExtensions` and `UnmanagedExternalExtensions` views (type-specific getters).
   - Add ignored-aware detection for unmanaged on-disk skills.
   - Add dedicated classifier unit tests for normative taxonomy scenarios, error codes, deterministic ordering, source metadata derivation precedence, and invariants across all `ExtensionType` values.

3. **Skill command updates**
   - Refactor `enable`, `disable`, `rename`, `uninstall`, `update`, `fork`, `publish`, `resolve-source`, `resolve-source-pattern`.
   - Update `resolve-source` and `resolve-source-pattern` configured skill source from `Option<string>` to `string` semantics.
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
     - `cli-skills-update`

5. **Test and cleanup**
   - Replace unmanaged marker fixtures with ignored fixtures where relevant.
   - Add tests for ignored glob behavior (for example `openspec-*`).
   - Add workspace service tests for changed method semantics:
     - `getInstalledPacks` includes lockfile-only implicit packs (including builtin lockfile entries).
     - configured-skill source fallback in `resolve-source` and `resolve-source-pattern` still resolves correctly with `source: string` configured entries.
     - `getConfiguredMcpServers` / `setMcpServer` / `removeMcpServer` use `mcpServers` settings key (camelCase) while pack manifest keys remain `mcp-servers`.
   - Remove obsolete `managed` assertions.
   - Run `pnpm lint`, `pnpm typecheck`, targeted unit tests, then full test suite.

Rollback approach:

- Code rollback is straightforward (single change set). No automatic settings-file rewrite is introduced by this design.

## Resolved Scope Decisions

- `ignored` remains internal in this change (no new dedicated ignore CLI commands); list/install/update flows consume classifier output and therefore naturally exclude ignored entries.
- Backward compatibility and migration for legacy marker-based settings are explicitly out of scope for this change.
- Lockfile-only non-native entries are treated as invalid classifier input and fail fast.
- Unmanaged discovery remains skills-only in this change; `command` / `mcp-server` / `pack` unmanaged sets stay empty until explicit follow-up detection work.
- Phase-1 detected sets are lockfile+settings for `command`/`mcp-server`/`pack`, and lockfile+settings+disk detection for `skill`.
- Short-name collisions are fail-fast with `WORKSPACE_EXTENSION_NAME_COLLISION`; no interactive rename path in this change.

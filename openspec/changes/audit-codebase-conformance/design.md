## Context

The codebase has accumulated technical debt where code doesn't follow CLAUDE.md conventions. This is a refactoring effort with no user-facing changes. Key areas:

- **Type definitions** use TypeScript built-ins (`T[]`, `Record<K,V>`, `prop?: T`) instead of Effect types (`Array.Array<T>`, `Record.Record<T>`, `Option<T>`)
- **Barrel files** re-export types from other modules, violating single-source-of-truth
- **Error handling** has one throwing helper and missing Schema validation in a few places
- **main.ts** uses Promise `.catch()` instead of Effect error handling

## Goals / Non-Goals

**Goals:**

- Align codebase with CLAUDE.md conventions
- Ensure all types use Effect standard library types
- Remove all cross-module re-exports
- Add Schema validation where missing
- Pass all existing tests after refactoring

**Non-Goals:**

- Adding new features or capabilities
- Backward compatibility for removed re-exports
- Wrapping test utilities with Effect (deferred—tests can use async/await)
- Converting mutable Map/Set in load-state.ts (acceptable for local scope)

## Decisions

### 1. Execution Order

**Decision:** Execute in dependency order to minimize cascading changes.

1. **Phase 1: Type definitions** — Convert `T[]`, `Record<K,V>`, `prop?: T` to Effect types
2. **Phase 2: Remove re-exports** — Update barrel files and fix consumer imports
3. **Phase 3: Error handling** — Fix throwing function, add Schema validation, fix main.ts
4. **Phase 4: Cleanup** — Remove redundant `| undefined`, run lint/typecheck

**Rationale:** Type changes are leaf changes with no dependencies. Re-export removal requires type changes to be stable first. Error handling is independent but grouped for coherence.

### 2. Optional Properties to Option<T>

**Decision:** Convert `prop?: T` to `prop: Option.Option<T>` using Effect's Option type.

```typescript
// Before
interface ParsedSource {
  readonly owner?: string;
  readonly ref?: string;
}

// After
interface ParsedSource {
  readonly owner: Option.Option<string>;
  readonly ref: Option.Option<string>;
}
```

**Rationale:** Makes nullability explicit in the type system. Requires updating all access sites to use Option combinators.

**Alternative considered:** Keep optional properties for external API boundaries. Rejected—internal consistency is more valuable, and we control all consumers.

### 3. Array and Record Types

**Decision:** Use Effect's `Array.Array<T>` and `Record.Record<K, V>` types.

```typescript
// Before
readonly files?: readonly string[];
readonly agents: Record<string, AgentConfig>;

// After
readonly files: Option.Option<Array.Array<string>>;
readonly agents: Record.Record<string, AgentConfig>;
```

**Rationale:** Consistency with Effect ecosystem. These are type aliases, so runtime behavior is unchanged.

### 4. Re-export Removal Strategy

**Decision:** Remove re-exports from barrel files and update all consumers to import from owning modules.

```typescript
// Before (extensions/skills/index.ts)
export { readSettings } from "../../settings/index.js";

// After (consumer file)
import { readSettings } from "../../settings/index.js"; // Direct import
```

**Steps:**

1. Identify all re-exports in each barrel file
2. Find all consumers using grep
3. Update consumer imports to point to owning module
4. Remove re-exports from barrel file
5. Run typecheck to verify

**Rationale:** Single source of truth for exports. Clearer dependency graph.

### 5. Throwing Helper Conversion

**Decision:** Convert `getSourcePath` to return `Effect.Effect<string, ApplyError>`.

```typescript
// Before
const getSourcePath = (source: SkillSourceV2): string => {
  if (source._tag !== "Local") throw new Error(...);
  return source.path;
};

// After
const getSourcePath = (source: SkillSourceV2) =>
  source._tag === "Local"
    ? Effect.succeed(source.path)
    : Effect.fail(new ApplyError({ message: "..." }));
```

**Rationale:** Typed errors in Effect signature. Caller already in Effect.gen context.

### 6. Schema Validation Additions

**Decision:** Add Schema validation for:

- `YAML.parse` in `load-state.ts` (RawLockfile parsing)
- Settings casts in `service.ts`

**Pattern:**

```typescript
const json = yield * Effect.try({ try: () => YAML.parse(content) });
const data =
  yield *
  Schema.decodeUnknown(RawLockfileSchema)(json).pipe(
    Effect.mapError((e) => new LockfileParseError({ message: e.message })),
  );
```

### 7. main.ts Error Handling

**Decision:** Replace `.catch()` with Effect's `Effect.catchAllCause` or similar.

```typescript
// Before
Effect.runPromise(program).catch((error) => {
  console.error(error);
  process.exit(1);
});

// After
program.pipe(
  Effect.catchAllCause((cause) =>
    Effect.sync(() => {
      console.error(Cause.pretty(cause));
      process.exit(1);
    }),
  ),
  Effect.runPromise,
);
```

**Rationale:** Keeps error handling in Effect world. Better error formatting with Cause.

## Risks / Trade-offs

**[Risk] Large number of files touched** → Mitigated by phased approach and running typecheck after each phase.

**[Risk] Option<T> changes cascade to many access sites** → Mitigated by starting with leaf types and working up. Use Option.getOrElse, Option.map, etc.

**[Risk] Re-export removal breaks external consumers** → No external consumers; this is an internal CLI package.

**[Trade-off] More verbose Option access vs. optional chaining** → Accepted for type safety and consistency with Effect patterns.

## Testing Strategy

- Run `pnpm typecheck` after each phase
- Run `pnpm test` after completing all phases
- Run `pnpm lint` to catch any remaining issues
- No new tests needed—this is refactoring with existing coverage

## Inventory

### 1. Optional Properties → Option<T>

**cli-commands/skills/install/handler.ts**

- Line 86: `nonInteractive?: boolean | undefined`
- Line 88: `dryRun?: boolean | undefined`
- Line 102: `cause?: unknown`
- Line 120: `commitSha?: string`

**cli-commands/skills/uninstall/handler.ts**

- Line 76: `cause?: unknown`

**cli-commands/init/handler.ts**

- Line 36: `nonInteractive?: boolean | undefined`

**settings/settings.ts**

- Line 55: `skills?: SkillsUpdate`
- Line 87: `cause?: unknown`
- Line 98: `cause?: unknown`
- Line 341: `global?: boolean`
- Line 343: `yes?: boolean`

**lockfile/lockfile.ts**

- Line 44: `cause?: unknown`
- Line 55: `cause?: unknown`

**workspace/errors.ts**

- Line 36: `cause?: unknown`

**workspace/apply.ts**

- Line 70: `onProgress?: (step: PlanStep, status: ...) => void`

**workspace/service.ts**

- Line 78: `agents?: readonly string[]`

**clack-effect/errors.ts**

- Line 16: `cause?: unknown`

**clack-effect/types.ts**

- Line 15: `hint?: string`
- Line 25: `initialValues?: readonly string[]`
- Line 26: `required?: boolean`

**clack-effect/test.ts**

- Line 59: `confirmBehavior?: ConfirmBehavior`
- Line 60: `selectBehavior?: SelectBehavior<unknown>`
- Line 61: `multiselectBehavior?: MultiselectBehavior<unknown>`

**extensions/skills/github-api.ts**

- Line 22: `status?: number`
- Line 26: `cause?: unknown`
- Line 41: `size?: number`

**extensions/skills/git.ts**

- Line 33: `cause?: unknown`

**extensions/skills/skill-discovery.ts**

- Line 26: `path?: string`
- Line 27: `cause?: unknown`

**extensions/skills/types.ts**

- Line 23: `description?: string`
- Line 65: `owner?: string`
- Line 67: `repo?: string`
- Line 69: `ref?: string`
- Line 71: `path?: string`
- Line 73: `url?: string`
- Line 75: `localPath?: string`
- Line 77: `baseUrl?: string`

**extensions/skills/state/types.ts**

- Line 29: `name?: string`
- Line 30: `description?: string`
- Line 31: `version?: string`
- Line 32: `triggers?: readonly string[]`
- Line 1115: `skill?: IdealSkillLegacy | SkillState`
- Line 1116: `from?: SkillState`
- Line 1117: `to?: IdealSkillLegacy`
- Line 1118: `target?: IdealSkillLegacy`

**resolution/types.ts**

- Line 29: `version?: string`
- Line 31: `description?: string`
- Line 33: `files?: readonly string[]`
- Line 35: `versionConstraint?: string`
- Line 51: `ref?: string`
- Line 53: `name?: string`
- Line 55: `path?: string`
- Line 69: `types?: readonly ExtensionType[]`
- Line 71: `sources?: readonly SourceType[]`
- Line 73: `agents?: readonly string[]`
- Line 75: `cwd?: string`
- Line 77: `scope?: string`
- Line 79: `projectDir?: string`
- Line 81: `globalDir?: string`

**agents/types.ts**

- Line 111: `detect?: AgentDetectFn`

**agents/detection.ts**

- Line 30: `cause?: unknown`

### 2. Array Types → Array.Array<T>

**cli-commands/skills/install/handler.ts**

- Line 74: `readonly agent: readonly string[]`
- Line 76: `readonly skill: readonly string[]`
- Line 732: `steps: ReadonlyArray<PlanStep>`
- Line 734: `steps: ReadonlyArray<PlanStep>`

**cli-commands/skills/uninstall/handler.ts**

- Line 58: `readonly agent: readonly string[]`

**cli-commands/init/handler.ts**

- Line 32: `readonly agent: readonly string[]`

**workspace/apply.ts**

- Line 120: `results: ReadonlyArray<...>`
- Line 167: `agents: ReadonlyArray<string>`
- Line 352: `agents: readonly AgentConfig[]`
- Line 752: `agents: ReadonlyArray<string>`

**workspace/ideal-state.ts**

- Line 57: `agents: ReadonlyArray<string>`
- Line 59: `skills: "all" | ReadonlyArray<string>`
- Line 72: `skills: ReadonlyArray<string>`
- Line 83: `skills: "all" | ReadonlyArray<string>`
- Line 120: `ReadonlyArray<DiscoveredSkill>`

**extensions/skills/github-api.ts**

- Line 50: `tree: ReadonlyArray<GitHubTreeEntry>`

**extensions/skills/types.ts**

- Line 139: `files: readonly string[]`
- Line 149: `skills: readonly WellKnownSkill[]`

**extensions/skills/state/types.ts**

- Line 65: `files: readonly string[]`
- Line 100: `agents: readonly string[]`
- Line 174: `errors: readonly string[]`
- Line 200: `issues: readonly SkillValidity[]`
- Line 363: `errors: ReadonlyArray<string>`
- Line 461: `paths: ReadonlyArray<string>`
- Line 640: `files: ReadonlyArray<string>`
- Line 642: `issues: ReadonlyArray<ActualSkillIssue>`
- Line 668: `agents: ReadonlyArray<string>`
- Line 697: `issues: ReadonlyArray<SkillStateIssue>`
- Line 719: `skills: ReadonlyArray<SkillStateV2>`
- Line 720: `issues: ReadonlyArray<WorkspaceIssue>`
- Line 747: `agents: ReadonlyArray<string>`
- Line 761: `agents: ReadonlyArray<string>`
- Line 791: `skills: ReadonlyArray<IdealSkillV2>`
- Line 937: `agents: readonly string[]`
- Line 971: `removals: readonly string[]`
- Line 1127: `changes: readonly SkillChangeWithName[]`
- Line 1173: `agents: ReadonlyArray<string>`
- Line 1183: `agents: ReadonlyArray<string>`
- Line 1188: `agents: ReadonlyArray<string>`
- Line 1202: `agents: ReadonlyArray<string>`
- Line 1212: `agents: ReadonlyArray<string>`
- Line 1215: `agents: ReadonlyArray<string>`
- Line 1256: `steps: ReadonlyArray<PlanStep>`
- Line 1321: `applied: ReadonlyArray<PlanStep>`
- Line 1322: `failed: ReadonlyArray<...>`

**clack-effect/test.ts**

- Line 51: `indices: readonly number[]`
- Line 52: `values: readonly T[]`

**resolution/resolvers/local-path.ts**

- Line 30: `EXTENSION_FILES: ReadonlyArray<...>`

### 3. Record<K,V> → Record.Record<K,V>

**settings/settings.ts**

- Line 45: `Readonly<Record<string, string | null>>`

**workspace/load-state.ts**

- Line 109: `skills: Record<string, RawLockEntry>`
- Line 121: return type `Record<string, LockedSkillV2>`
- Line 167: `const result: Record<string, LockedSkillV2>`

**workspace/apply.ts**

- Line 860: `Record<string, SkillLockEntry>`
- Line 947: `Record<string, string>`

**extensions/skills/types.ts**

- Line 109: `Readonly<Record<string, LockEntry>>`

**extensions/skills/state/types.ts**

- Line 837: `Readonly<Record<string, SkillState>>`
- Line 970: `Readonly<Record<string, IdealSkillLegacy>>`
- Line 1089: `Readonly<Record<string, SkillChange>>`

**e2e/utils.ts**

- Line 37: `env?: Record<string, string>`

### 4. Re-exports to Remove

**workspace/index.ts**

- Lines 63-73: Re-exports from `../lockfile/index.js` (Lockfile, SkillLockEntry, SkillsLockMap, LockfileError, LOCKFILE_NAME, LockfileParseError, LockfileWriteError, readLockfile, removeLockEntry, updateLockEntry, writeLockfile)
- Lines 76-96: Re-exports from `../settings/index.js` (Settings, EnsureInitializedOptions, SettingsError, SettingsUpdate, SkillsUpdate, addSkill, createDefaultSettings, DEFAULT_SCOPE, ensureInitialized, getEffectiveScope, readSettings, SETTINGS_FILENAME, SettingsNotFoundError, SettingsParseError, SettingsWriteError, updateSettings, writeSettings)
- Lines 14-18: Re-exports from `../extensions/skills/state/types.js` (CurrentState, IdealState, SkillSourceV2)

**extensions/skills/index.ts**

- Lines 9-10: Re-exports types from `../../lockfile/index.js` and `../../settings/index.js`
- Lines 21-29: Re-exports from `../../lockfile/index.js`
- Lines 31-49: Re-exports from `../../settings/index.js`

**cli-commands/skills/display.ts**

- Lines 17-18: Re-exports from `../../workspace/index.js`

### 5. Throwing Functions

**workspace/apply.ts**

- Line 372: `throw new Error(...)` in `getSourcePath` — **VIOLATION**: not inside Effect.tryPromise

Note: `extensions/skills/git.ts` lines 181, 187 throw inside `Effect.tryPromise` `try` callback, which is the correct pattern (caught by `catch` handler). Not a violation.

### 6. Promise .catch() Pattern

**main.ts**

- Line 38: `Effect.runPromise(program).catch(...)`

### 7. Type Casts Without Validation

**workspace/service.ts**

- Line 170: `agentIds as Settings["agents"]`
- Line 280: `{} as Settings`

**workspace/apply.ts**

- Line 939: `error as { message: string }`

**extensions/skills/wellknown.ts** (lower priority - has manual typeof validation, could use Schema)

- Line 167: `data as { skills?: unknown }`
- Line 182: `skill as { ... }`

### Summary

| Category            | Files         | Instances        |
| ------------------- | ------------- | ---------------- |
| Optional properties | 17            | ~80              |
| Array types         | 12            | ~60              |
| Record types        | 5             | 10               |
| Re-exports          | 3             | ~48              |
| Throwing functions  | 1             | 1                |
| Promise .catch()    | 1             | 1                |
| Unsafe casts        | 3             | 5                |
| **Total**           | **~20 files** | **~210 changes** |

## Context

The install handler orchestrates a 14-step pipeline. Steps 5-7 discover skills, select them, and resolve metadata. Step 8 then passes this into `buildIdealForInstall` via `BuildIdealDeps` callbacks — which re-performs parsing and discovery.

Two separate source types represent the same concept:

- **`Source`** (`sources/types.ts`): 7 variants (GitHub, GitLab, Bitbucket, AzureRepos, Git, Registry, Local). Used by parsing, resolution, and discovery.
- **`SkillSourceV2`** (`extensions/skills/state/types.ts`): 3 variants (GitHub, Registry, Local). Used by lockfile, settings, and ideal state.

The conversion is lossy — gitlab/bitbucket collapse to Local, losing provenance. The batch command types each require separate builder functions with different dep interfaces.

## Goals / Non-Goals

**Goals:**

- Unify `Source` and `SkillSourceV2` into one type
- Replace batch command types with per-skill `WorkspaceOperation` union
- Replace separate builder functions with a single `buildIdealState(currentState, operations)` fold
- Eliminate `BuildIdealDeps`, `BuildIdealUpdateDeps`, `BuildIdealStateDeps`
- Remove `createBuildIdealDeps` and `sourceToV2` from the install handler

**Non-Goals:**

- Changing the discovery or selection logic
- Modifying the plan/apply pipeline (beyond source type updates)
- Changing `DiscoveredSkill` at the handler level

## Decisions

### 1. Use `Source` as the single source type everywhere

**Current**: `Source` for parsing, `SkillSourceV2` for state. Lossy conversion between them.

**New**: `Source` from `sources/types.ts` is the canonical type. All state types (`IdealSkillV2`, `LockedSkillV2`, `SkillStateV2`, etc.) reference `Source` instead of `SkillSourceV2`. `SkillSourceV2` is deleted.

**Rationale**: They represent the same concept. The conversion was lossy (gitlab/bitbucket → Local). Using one type eliminates the conversion entirely and preserves provenance.

**Impact on serialization**: `sourceV2ToLockEntry` and `sourceV2ToSettingsValue` in `apply.ts` update to handle all `Source` variants. `parseSourceFromEntry` in `load-state.ts` returns `Source`. The lockfile format gains `gitlab`, `bitbucket`, `azurerepos`, `git` source discriminators.

### 2. Per-skill operations instead of batch commands

**Current**: `InstallCommand { source, agents, skills: string[], force }` + `UninstallCommand { skills }`.

**New**: Atomic operations per skill:

```typescript
interface DiscoveredSkill {
  readonly name: string;
  readonly version: Option<string>;
  readonly gitTreeHash: Option<string>;
}

interface AddSkillOperation {
  readonly _tag: "add-skill";
  readonly source: Source;
  readonly agents: ReadonlyArray<string>;
  readonly skill: DiscoveredSkill;
  readonly force: boolean;
}

interface RemoveSkillOperation {
  readonly _tag: "remove-skill";
  readonly name: string;
}

type WorkspaceOperation = AddSkillOperation | RemoveSkillOperation;
```

**Rationale**: Each operation is self-contained. No callbacks, no re-discovery. The handler uses `source` directly — no conversion.

### 3. buildIdealState as a fold over operations

**Current**: `buildIdealState(current, cmd, deps)` dispatches to separate builder functions.

**New**: `buildIdealState(current, ops)` folds operations over current state:

```typescript
const buildIdealState = (
  current: CurrentState,
  ops: ReadonlyArray<WorkspaceOperation>,
): Effect<IdealState, CommandError>
```

- `add-skill`: Add/replace skill in ideal state (with conflict check)
- `remove-skill`: Remove skill from ideal state (with existence check)

### 4. Handler uses Source directly

The handler's `parseSource` returns `Source`. That same value goes straight onto `AddSkillOperation.source` — no conversion:

```typescript
const source = yield * parseSource(args.source);

const ops = Array.map(
  selectedSkills,
  (s): AddSkillOperation => ({
    _tag: "add-skill",
    source,
    agents: Array.map(agents, (a) => a.id),
    skill: {
      name: s.name,
      version: Option.none(),
      gitTreeHash: s._tag === "local-git" ? Option.some(s.gitTreeSha) : Option.none(),
    },
    force: args.force,
  }),
);

const ideal = yield * buildIdealState(currentState, ops);
```

### 5. Update command deferred

`buildIdealForUpdate` + `BuildIdealUpdateDeps` kept as-is for now. It can be migrated to an `UpdateSkillOperation` later.

## Risks / Trade-offs

**[Lockfile format change]** → Adding new source discriminators (`gitlab`, `bitbucket`, etc.) to lockfile. → Mitigation: Old lockfiles with `source: "local"` for collapsed gitlab/bitbucket will still load (backward-compatible read). New writes use the correct source type.

**[Larger scope]** → Source unification + operations model is two changes in one. → Mitigation: Source unification is prerequisite for clean operations (otherwise we'd still need conversion). They naturally belong together.

**[Test rewrite]** → All `buildIdealForInstall` and `buildIdealForUninstall` tests need rewriting. State type tests referencing `SkillSourceV2` need updating. → Mitigation: New tests are simpler (no mocks, direct source values).

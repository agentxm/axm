## Context

The install handler uses a state-based architecture:

1. Load current state (`loadSkillsState`)
2. Build ideal state (`buildIdealForInstall`)
3. Compute diff (`computeDiff`)
4. Display plan
5. Apply changes

However, step 5 bypasses the state system. The `installSkillsFromFileSystem` function reimplements file operations and directly manipulates settings/lockfile with hardcoded values, instead of using the existing `applyDiff()`.

The `applyDiff()` function in `packages/core/src/experimental/skills/state/apply.ts` handles:

- File operations (copy to canonical, symlink to agents)
- Settings updates via `sourceToSettingsValue()`
- Lockfile updates via `idealToLockEntry()`

However, `sourceToSettingsValue()` currently returns `local:<path>` for local sources, but we want just the path (no prefix).

The handler bypasses this with hardcoded `"*"`:

```typescript
// handler.ts lines 465-467
const skillsToAdd = Object.fromEntries(
  installResults.map(({ skillName }) => [skillName, "*"] as const), // ← Bug
);
```

## Goals / Non-Goals

**Goals:**

- Local source installation records the path in settings/lockfile instead of `"*"`
- Use the existing state-based application pattern consistently in both install and uninstall
- Remove duplicate code from handlers

**Non-Goals:**

- Backward compatibility with existing `"*"` entries
- Changing how remote sources are handled
- Adding new application logic (use existing `applyDiff`)

## Decisions

### Decision 1: Replace `installSkillsFromFileSystem` with `applyDiff`

**Choice**: Delete the handler's custom installation logic and use `applyDiff()` instead.

#### Before (handler.ts lines 883-945)

```typescript
// Step 13: Apply changes
const skillsToInstall = Object.entries(diff.changes)
  .filter(
    (entry): entry is [string, SkillChange] =>
      entry[1]._tag === "Add" || entry[1]._tag === "Update",
  )
  .map(([name]) => skills.find((s) => s.name === name))
  .filter((s): s is Skill => s !== undefined);

if (skillsToInstall.length === 0) {
  if (showOutput) {
    p.log.info("No skills to install.");
    p.outro("Nothing to do.");
  }
  return;
}

if (showOutput) {
  spinnerHelper.start(`Installing ${skillsToInstall.length} skill(s)...`);
}

const results =
  yield * installSkillsFromFileSystem(skillsToInstall, agents, axmDir, parsed);

if (showOutput) spinnerHelper.stop(`Installed ${results.length} skill(s)`);

// Show results summary using InstallResult[]
if (showOutput) {
  const byMethod = {
    symlink: results.filter((r) => r.method === "symlink").length,
    copy: results.filter((r) => r.method === "copy").length,
  };
  // ... display logic
}
```

#### After (handler.ts)

```typescript
// Step 13: Apply changes
if (showOutput) {
  spinnerHelper.start(
    `Applying ${diff.summary.add + diff.summary.update} change(s)...`,
  );
}

const applyResult =
  yield *
  applyDiff(diff, { axmDir, agents }).pipe(
    Effect.mapError(
      (error) =>
        new InstallError({
          message: `Failed to apply changes: ${error.message}`,
          cause: error,
          retryable: false,
        }),
    ),
  );

if (showOutput)
  spinnerHelper.stop(`Applied ${applyResult.applied.length} change(s)`);

// Show results summary using ApplyResult
if (showOutput) {
  for (const result of applyResult.applied) {
    const methods = result.agentResults.map((r) => r.method);
    const symlinkCount = methods.filter((m) => m === "symlink").length;
    const copyCount = methods.filter((m) => m === "copy").length;
    // ... display logic using result.skillName, result.agentResults
  }

  if (applyResult.failed.length > 0) {
    for (const failure of applyResult.failed) {
      p.log.error(`${failure.skillName}: ${failure.error.message}`);
    }
  }
}
```

#### Code to delete

| Location                           | Lines   | Description             |
| ---------------------------------- | ------- | ----------------------- |
| `createLockEntryFromParsed`        | 120-170 | Unused after change     |
| `installSingleSkillFromFileSystem` | 382-418 | Replaced by `applyAdd`  |
| `installSkillsFromFileSystem`      | 423-480 | Replaced by `applyDiff` |
| Import `updateLockEntry`           | 36      | No longer needed        |
| Import `updateSettings`            | 37      | No longer needed        |

#### New import needed

```typescript
import {
  applyDiff,
  type ApplyResult,
} from "@agentxm/core/experimental/skills/state";
```

**Rationale**: `applyDiff()` already implements the correct behavior. The handler's `installSkillsFromFileSystem` duplicates this logic but with bugs. Removing the duplication fixes the bug and simplifies the codebase.

**Alternatives considered**:

- Fix the hardcoded `"*"` value inline: Would work but keeps duplicate code.
- Call both functions: Would duplicate file operations.

### Decision 2: Local sources use plain path in settings (no prefix)

**Choice**: Modify `sourceToSettingsValue()` in apply.ts to return just the path for local sources.

#### Before (apply.ts line 190-201)

```typescript
const sourceToSettingsValue = (source: SkillSource): string => {
  switch (source._tag) {
    case "Local":
      return `local:${source.path}`; // ← Has prefix
    case "Git":
      return `git:${source.url}`;
    // ...
  }
};
```

#### After

```typescript
const sourceToSettingsValue = (source: SkillSource): string => {
  switch (source._tag) {
    case "Local":
      return source.path; // ← Just the path
    case "Git":
      return `git:${source.url}`;
    // ...
  }
};
```

**Rationale**: Local paths are unambiguous (they start with `/` or `./`). The `local:` prefix adds no value and differs from how users specify local sources on the command line.

#### File to modify

| Location                | File                                                           | Change                 |
| ----------------------- | -------------------------------------------------------------- | ---------------------- |
| `sourceToSettingsValue` | `packages/core/src/experimental/skills/state/apply.ts:190-201` | Remove `local:` prefix |

### Decision 3: Rewrite uninstall handler to use state-based pattern

**Choice**: Replace direct file/settings/lockfile manipulation with the full reconciliation pattern.

#### Before (uninstall/handler.ts)

```typescript
// Step 2: Load lockfile directly
const lockfile = yield * readLockfile(axmDir);
const lockEntry = lockfile.skills[args.skill];

// Step 4: Manual plan computation
const isFullRemoval = remainingAgents.length === 0;

// Step 8: Direct file manipulation
if (isFullRemoval) {
  yield * removeSkillFromAgents(args.skill, agentConfigs, axmDir);
  yield * updateSettings(axmDir, { skills: { [args.skill]: null } });
  yield * removeLockEntry(axmDir, args.skill);
} else {
  // Manual symlink removal...
  yield * updateLockEntry(axmDir, args.skill, updatedEntry);
}
```

#### After (uninstall/handler.ts)

```typescript
// Step 2: Load current state
const currentState = yield * loadSkillsState(axmDir);

// Step 3: Build ideal state
const ideal = yield * buildIdealForUninstall(currentState, [args.skill]);

// Step 4: Compute diff
const diff = computeDiff(currentState, ideal);

// Step 5: Display plan (existing displayPlan can use diff)

// Step 8: Apply via applyDiff
const applyResult = yield * applyDiff(diff, { axmDir, agents: agentConfigs });
```

#### Code to delete from uninstall handler

| Location                     | Lines   | Description                                          |
| ---------------------------- | ------- | ---------------------------------------------------- |
| Direct lockfile read         | 162-172 | Replaced by `loadSkillsState`                        |
| Manual plan computation      | 191-200 | Replaced by `buildIdealForUninstall` + `computeDiff` |
| `removeSkillFromAgents` call | 261-270 | Replaced by `applyDiff`                              |
| `updateSettings` call        | 273-283 | Replaced by `applyDiff`                              |
| `removeLockEntry` call       | 286-295 | Replaced by `applyDiff`                              |
| Partial removal logic        | 296-340 | Replaced by `applyDiff`                              |

#### Imports to change

```typescript
// Remove
import {
  readLockfile,
  removeLockEntry,
  removeSkillFromAgents,
  updateLockEntry,
  updateSettings,
} from "...";

// Add
import {
  loadSkillsState,
  buildIdealForUninstall,
  computeDiff,
  applyDiff,
} from "@agentxm/core/experimental/skills/state";
```

**Rationale**: The uninstall handler's docstring claims to use the reconciliation pattern but the implementation doesn't. This creates inconsistency and maintenance burden.

## Risks / Trade-offs

**[Risk]** Display format changes slightly (using `ApplyResult` vs `InstallResult[]`).
→ **Mitigation**: Both provide skill name and per-agent results. The display logic update is straightforward.

**[Risk]** Partial uninstall (--agent flag) may need `buildIdealForUninstall` enhancement.
→ **Mitigation**: The V2 version `buildIdealForUninstallV2` already supports agent-specific removal via options.

**[Trade-off]** Removes some handler-specific customization options.
→ This is acceptable. The state-based pattern should be the single source of truth.

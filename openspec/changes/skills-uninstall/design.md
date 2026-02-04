## Context

The install handler (`packages/cli/src/commands/skills/install/handler.ts`) uses a state-based reconciliation pattern:

1. Load current state (actual + locked)
2. Build ideal state from command
3. Compute diff (plan)
4. Apply plan

The state system already defines `UninstallSkill` steps in the diff computation and has stubs for applying them. The uninstall command needs to leverage this existing machinery.

## Goals / Non-Goals

**Goals:**

- Remove skills from specified agents (or all agents)
- Clean up canonical copy when no agents reference the skill
- Update lockfile and settings
- Reuse existing state reconciliation pattern

**Non-Goals:**

- Cache cleanup (git clones remain for future installs)
- Batch uninstall of multiple skills in one command (use multiple invocations)

## Decisions

### 1. Reuse State Reconciliation

**Decision:** Build `buildIdealForUninstall` function that constructs ideal state with target skill removed.

**Rationale:** The install handler already uses this pattern. The diff computation (`computeDiff`) already produces `UninstallSkill` steps when current has skills that ideal doesn't.

**Alternative:** Direct file deletion without state reconciliation.
**Rejected:** Would bypass existing plan display and confirmation flow.

### 2. Handler Structure Mirrors Install

**Decision:** Create `packages/cli/src/commands/skills/uninstall/handler.ts` following install's structure:

- `UninstallArgs` interface with `skill`, `agent`, `yes`, `dryRun`, `json` flags
- `UninstallError` tagged error class
- `handleUninstall` function using Effect.gen

**Rationale:** Consistency with existing CLI patterns.

### 3. Apply Step: Remove from Agents

**Decision:** Implement `removeSkillFromAgents(skillName, agents, axmDir)` in `@agentxm/core/experimental/skills`.

Inverse of `installSkillToAgents`:

1. For each agent, delete symlink/dir at `<skillsDir>/<skillName>`
2. Delete canonical at `.axm/skills/<skillName>/`

**Rationale:** Keeps file system operations in core package.

### 4. Settings Removal

**Decision:** Extend `updateSettings` to accept `null` values for skill removal, or add `removeSkill(axmDir, skillName)` function.

```typescript
// Option A: null means remove
updateSettings(axmDir, { skills: { "my-skill": null } });

// Option B: explicit remove function
removeSkill(axmDir, skillName);
```

**Preferred:** Option A - more composable, matches JSON merge-patch semantics.

### 5. Partial Uninstall (Per-Agent)

**Decision:** When `--agent` is specified, only remove from those agents. If skill remains installed for other agents, keep canonical copy.

Build ideal state by removing skill only from specified agents' lists. The diff will produce partial uninstall steps.

## Risks / Trade-offs

**Orphaned canonical copies**
→ If uninstall fails mid-way, canonical may remain with no agent references. Mitigated by `axm doctor` detecting orphans.

**Lockfile entry with empty agents array**
→ When skill is uninstalled from all agents, remove lockfile entry entirely rather than leaving empty agents array.

## File Changes

| File                                                         | Change                         |
| ------------------------------------------------------------ | ------------------------------ |
| `packages/cli/src/commands/skills/uninstall.ts`              | New yargs command definition   |
| `packages/cli/src/commands/skills/uninstall/handler.ts`      | New handler                    |
| `packages/cli/src/commands/skills/uninstall/handler.test.ts` | Handler tests                  |
| `packages/cli/e2e/skills-uninstall.test.ts`                  | E2E tests                      |
| `packages/core/src/experimental/skills/index.ts`             | Export `removeSkillFromAgents` |
| `packages/core/src/experimental/skills/install.ts`           | Add `removeSkillFromAgents`    |
| `packages/core/src/experimental/skills/state/ideal.ts`       | Add `buildIdealForUninstall`   |

## Context

Currently, workspace initialization is implicit—`ensureInitialized()` in `packages/core/src/experimental/skills/settings.ts` creates `.axm/settings.json` with empty defaults when commands like `skills install` run. This works but:

1. Users cannot preview what will be initialized (no dry-run)
2. No way to re-initialize with different agent selections
3. Agent detection + prompting is duplicated in command handlers
4. No explicit "setup my workspace" entry point

The `init` command provides explicit control while the state-based architecture (from dry-run-sketch.md) enables preview and consistency.

## Goals / Non-Goals

**Goals:**

- Explicit `axm init` command for workspace setup
- Dry-run support using actual → ideal → diff pattern
- Re-initialization with `--force`
- Non-interactive mode with `--yes` (detected agents, `@community` scope)
- Factor initialization logic into reusable core module

**Non-Goals:**

- Custom scope configuration (future enhancement)
- Migration from other tools
- Global/user-level initialization (project-level only for now)

## Decisions

### 1. State-based architecture for dry-run

**Decision:** Use actual → ideal → diff → apply pattern consistent with skills install.

**Rationale:** Provides consistent dry-run behavior across commands. The diff shows exactly what will be created/modified.

**Alternatives considered:**

- Simple "would create" messages: Less consistent, harder to test
- No dry-run: Users lose visibility into what init does

### 2. InitState types in core

**Decision:** Create `WorkspaceInitState` types in `packages/core/src/experimental/workspace-init/`:

- `ActualInitState`: What exists on disk (settings.json presence, content, validity)
- `IdealInitState`: Desired state (agents, scope)
- `InitChange`: Add (new workspace) | Update (re-init with --force) | Unchanged

**Rationale:** Follows established pattern from dry-run-sketch.md. Enables type-safe diff computation.

### 3. Initialization validity states

**Decision:** Define `InitValidity` discriminated union:

- `Valid`: Workspace properly initialized
- `NotInitialized`: No `.axm/settings.json`
- `Invalid`: Settings exist but fail schema validation

**Rationale:** Maps directly to the three states in the proposal's logic.

### 4. Agent selection flow

**Decision:** Reuse existing `detectAgents()` from agent-detection.ts. Selection logic:

- `--yes`: Use all detected agents
- Interactive: Prompt with detected agents pre-selected (using Bombshell multiselect)
- `--agent <id>`: Override with specific agents (future consideration)

**Rationale:** Agent detection is already well-implemented. Keep selection logic in handler, not core.

### 5. Default scope

**Decision:** Use `@community` as default scope, matching `getEffectiveScope()` behavior.

**Rationale:** Consistency with existing behavior. Custom scope is explicitly a non-goal for this change.

### 6. Handler location

**Decision:** `packages/cli/src/commands/init/handler.ts` with command at `command.ts`.

**Rationale:** Top-level command (`axm init`), not a subcommand.

### 7. Shared initialization module

**Decision:** Create `packages/core/src/experimental/workspace-init/` with:

- `types.ts`: State and change types
- `state.ts`: Load actual state, build ideal state
- `diff.ts`: Compute changes
- `apply.ts`: Execute initialization

**Rationale:** Clean separation enables reuse by `skills install` and future commands.

## Risks / Trade-offs

**[Risk] Existing `ensureInitialized()` behavior change** → Mitigation: Keep `ensureInitialized()` for backward compatibility in `skills install`. It can delegate to the new module internally.

**[Risk] Agent detection returns empty list** → Mitigation: Error with helpful message suggesting manual agent specification (future `--agent` flag).

**[Trade-off] Scope is not configurable** → Accepted: Explicit non-goal. Can add `--namespace` flag later without breaking changes.

**[Trade-off] No validation of invalid workspaces** → Accepted: Proposal specifies "Error for now" for invalid workspaces. Future work can add repair/migration.

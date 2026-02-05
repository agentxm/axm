## Context

Workspace initialization logic is currently spread across multiple handlers:

- `init/handler.ts` - Full init flow: agent detection, selection, state building, file creation
- `skills/install/handler.ts` - Duplicates agent detection/selection, calls `makeWorkspaceContext()`
- `skills/uninstall/handler.ts` - Uses workspace context, has agent selection logic

The `OperationContext` service provides `cwd`, `dryRun`, and `interactive` context. The `WorkspaceContext` service only reads existing state (settings.json, axm-lock.yaml) and fails with `WorkspaceNotInitializedError` if files are missing.

## Goals / Non-Goals

**Goals:**

- Consolidate all initialization logic into `WorkspaceContext.make()` factory
- Auto-initialize global workspace with empty files (no prompts)
- Auto-initialize project workspace with full agent detection/selection flow
- Support `yes` flag to auto-accept detected agents
- Support `nonInteractive` flag to disable prompts (fail if input needed)
- Remove `OperationContext` service entirely
- Make `init` command a thin wrapper around WorkspaceContext layer creation

**Non-Goals:**

- Backward compatibility with existing APIs
- Supporting dry-run mode during initialization (can be added later)
- Preserving any OperationContext functionality beyond what moves to WorkspaceContext

## Decisions

### Decision 1: WorkspaceContextOptions gains init-related flags

```typescript
interface WorkspaceContextOptions {
  readonly global: boolean;
  readonly yes: boolean; // Auto-accept detected agents
  readonly nonInteractive: boolean; // Disable all prompts
}
```

**Rationale:** These flags control initialization behavior and belong with the workspace creation options. Moving them here eliminates the need for OperationContext.

**Alternatives:**

- Keep flags in separate service → Rejected: adds indirection, OperationContext would still be needed
- Pass flags through layer dependencies → Rejected: options are simpler and more explicit

### Decision 2: Initialization behavior varies by scope

| Scope   | Settings Missing         | Lockfile Missing                |
| ------- | ------------------------ | ------------------------------- |
| Global  | Create `{}`              | Create `version: 1, skills: []` |
| Project | Run agent selection flow | Create empty lockfile           |

**Rationale:** Global workspace is a fallback/default location that doesn't need agent configuration. Project workspace needs explicit agent selection since it's the primary use case.

**Alternatives:**

- Always run agent selection → Rejected: global workspace shouldn't prompt
- Never auto-initialize → Rejected: defeats purpose of consolidation

### Decision 3: Agent selection moves into WorkspaceContext initialization

The agent detection, filtering, and selection logic currently in handlers moves into the `make()` function. When project settings.json is missing:

1. Detect installed agents
2. If `yes=true`: use all detected agents
3. If `nonInteractive=true` and selection needed: fail with error
4. Otherwise: prompt for selection via InteractionContext dependency

**Rationale:** Agent selection is fundamentally part of "initializing a workspace" not "running a command."

### Decision 4: InteractionContext becomes optional dependency

```typescript
make(options): Effect<..., ..., FileSystem | InteractionContext>
```

When `nonInteractive=true`, InteractionContext is not required. When prompts are needed but InteractionContext is not provided, fail with descriptive error.

**Rationale:** Allows non-interactive use (CI, scripts) while supporting interactive use when available.

**Alternatives:**

- Always require InteractionContext → Rejected: breaks non-interactive use
- Make it always optional with silent failures → Rejected: hides errors

### Decision 5: Init command becomes thin layer provider

```typescript
// init/handler.ts - simplified
export const handleInit = (args: InitArgs) =>
  Effect.gen(function* () {
    yield* WorkspaceContext; // Forces initialization
    yield* Console.log("Workspace initialized");
  });
```

The command exists only to explicitly trigger workspace initialization and provide user feedback. All logic lives in WorkspaceContext.

### Decision 6: Remove OperationContext entirely

| OperationContext field | Disposition                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `cwd`                  | Not needed—paths come from `getAxmDir()`                            |
| `dryRun`               | Remove from init; handlers that need it use args directly           |
| `interactive`          | Replaced by `nonInteractive` option + InteractionContext dependency |

**Rationale:** OperationContext was a grab-bag of unrelated concerns. The useful parts move to where they belong.

## Risks / Trade-offs

**[Risk] Interactive prompts during layer creation**
→ Mitigation: Document that WorkspaceContext layer with `nonInteractive=false` may prompt. Handlers should create the layer early and handle InteractionContext requirements.

**[Risk] Init command loses visibility into what's happening**
→ Mitigation: WorkspaceContext.make() should emit telemetry/logging for observability. Init command can yield the context and display settings.

**[Trade-off] Less flexibility in handler init logic**
→ Acceptable: Consistency is more valuable than per-handler customization. Handlers that need special behavior can use `WorkspaceContext.layer()` with custom service.

**[Trade-off] Agents selected during implicit init, not command execution**
→ Acceptable: Agent selection happens once at workspace creation time, which is the correct semantic.

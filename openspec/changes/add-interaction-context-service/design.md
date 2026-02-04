## Context

CLI handlers currently access `Clack` service directly for interactive prompts. The `OperationContext` service provides operation-level config (`cwd`, `dryRun`) but has no awareness of interactivity. Handlers must independently determine if interaction is available (TTY check, `--yes` flag, CI environment).

Current structure:

- `OperationContext` — operation config (cwd, dryRun)
- `Clack` — prompts, spinners, logging (always required in dependency graph)

## Goals / Non-Goals

**Goals:**

- Provide `InteractionContext` service that wraps `Clack` capabilities
- Expose `interaction: Option<InteractionContext>` in `OperationContext`
- Enable handlers to cleanly branch on interactivity availability
- Maintain testability with mock implementations

**Non-Goals:**

- Auto-detection of TTY/CI (caller decides when to provide InteractionContext)
- Changing `Clack` service internals
- Migrating all existing handlers (separate effort)

## Decisions

### 1. InteractionContext wraps Clack with direct access

**Decision:** `InteractionContext` exposes `ClackService` via `p` property for direct access.

```typescript
interface InteractionContextService {
  readonly p: ClackService; // Direct Clack access
}
```

**Alternatives considered:**

- Duplicate all Clack methods on InteractionContext → redundant, maintenance burden
- Abstract interface hiding Clack → adds indirection without benefit

**Rationale:** The `p` property provides direct access to the underlying Clack service, keeping the interface thin. Usage: `ctx.interaction.p.confirm("Proceed?")`.

### 2. Option in OperationContext, not separate service check

**Decision:** `OperationContext` includes `interaction: Option<InteractionContext>` field.

**Alternatives considered:**

- Separate `InteractionAvailable` service → more ceremony, same effect
- Boolean flag + separate service → split state, error-prone

**Rationale:** Single source of truth. Handler pattern:

```typescript
const ctx = yield * OperationContext;
const result = Option.match(ctx.interaction, {
  onNone: () => useDefaults(),
  onSome: (i) => i.p.confirm("Proceed?"),
});
```

### 3. Layer composition at command entry

**Decision:** Commands compose layers based on runtime context (TTY, flags).

```typescript
// Interactive mode
OperationContext.layer({ cwd, dryRun, interaction: Option.some(interactionCtx) });

// Non-interactive mode
OperationContext.layer({ cwd, dryRun, interaction: Option.none() });
```

**Rationale:** Keeps detection logic at the edge. Handlers stay pure.

## Risks / Trade-offs

- **[Increased config surface]** → OperationContext grows. Mitigation: Field is optional via Option, no breaking change to existing code.
- **[Layer wiring complexity]** → Commands must decide interactivity. Mitigation: Provide helper for common patterns (e.g., `withInteraction(config)`).

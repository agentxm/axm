## Context

The install handler has an inline plan-confirm-apply flow that doesn't account for `--preview` or `--non-interactive`. The uninstall handler is a stub that will need the same flow. Both commands (and future plan-based commands) need identical flag interaction logic.

`WorkspaceContextService` already holds `yes` and `nonInteractive` from construction. Adding `resolvePlan` as a method means handlers don't re-implement flag logic — they call `ws.resolvePlan(plan, { preview })` and the service does the right thing.

The codebase still references `--dry-run` / `dryRun` in live code, specs, and docs. This change replaces all of them with `--preview` / `preview`.

## Goals / Non-Goals

**Goals:**

- Single `resolvePlan` method on `WorkspaceContextService` that all plan-based handlers use
- Correct resolution algorithm: preview (with yes/nonInteractive/interactive sub-branches) vs default
- Auto-detect CI/CD environments and treat as non-interactive
- Replace all `--dry-run` / `dryRun` with `--preview` / `preview` in live code, specs, and docs

**Non-Goals:**

- Changing the `Plan<Op>`, `displayPlan`, or `applyPlan` implementations
- Adding `--preview` to non-plan commands (e.g., `init`)
- Modifying archived change documents

## Decisions

### 1. `resolvePlan` as a method on `WorkspaceContextService`

Add to the service interface:

```typescript
readonly resolvePlan: <Op>(
  plan: Plan<Op>,
  options: { readonly preview: boolean },
) => Effect.Effect<void, PromptCancelled | PromptError, Clack>;
```

The method uses `yes` and `nonInteractive` captured at service construction time (from `WorkspaceContextOptions`). Callers pass only the plan and `preview`.

**Alternative considered**: Standalone function taking all four args (`plan`, `preview`, `yes`, `nonInteractive`). Rejected because `yes` and `nonInteractive` are already known to the service — passing them again is redundant and risks inconsistency if a handler passes different values than what the service was constructed with.

### 2. `nonInteractive` resolved to boolean on service

`WorkspaceContextService` stores `nonInteractive` as a plain `boolean`, resolved once at construction:

```typescript
// In make():
const nonInteractive = Option.getOrElse(options.nonInteractive, () => process.env.CI === "true");
```

`WorkspaceContextOptions.nonInteractive` remains `Option<boolean>` (the CLI boundary). The service resolves it: `Some(true/false)` uses the explicit value, `None` falls back to CI detection. The resolved boolean is stored on the service and used by `resolvePlan` and workspace initialization.

**Alternative considered**: Keep `nonInteractive` as `Option<boolean>` on the service and resolve at each use site. Rejected — resolution logic would be duplicated and easy to get wrong. Resolve once, use everywhere.

**Alternative considered**: Check `!process.stdin.isTTY`. Rejected because non-TTY can occur in legitimate interactive contexts (e.g., piping input). `CI=true` is an explicit signal from the environment.

### 3. Resolution algorithm

```typescript
if (preview) {
  log.info("Previewing changes...");
  displayPlan(plan);
  if (yes) {
    log.info("Pre-approved via --yes, applying changes...");
    applyPlan(plan);
  } else if (nonInteractive) {
    log.warn("Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.");
  } else {
    const confirmed = confirm("Apply changes?");
    if (!confirmed) {
      outro("Cancelled.");
      return;
    }
    applyPlan(plan);
  }
} else {
  displayPlan(plan);
  applyPlan(plan);
}
```

Two top-level branches. `preview` logs that it's previewing, displays the plan, then sub-branches: `yes` pre-approves with a log, `nonInteractive` without `yes` is a no-op with a warning, otherwise the user confirms interactively. The default displays then applies.

**Alternative considered**: Default prompts for confirmation. Rejected — the user has already made their intent clear by running the command. Showing the plan provides transparency; gating on confirmation adds friction without safety benefit. Use `--preview` when you want the confirmation gate.

### 4. `preview` as a plain `boolean` (not `Option<boolean>`)

The handler args type uses `readonly preview: boolean` with `default: false` in yargs. Unlike `nonInteractive` where "not specified" vs "explicitly false" matters (Option semantics), `preview` is a simple on/off toggle — you either want preview mode or you don't.

**Alternative considered**: `Option<boolean>` like `nonInteractive`. Rejected because there's no meaningful difference between "user didn't pass `--preview`" and "user passed `--no-preview`" — both mean "don't preview".

### 5. `docs/designs/dry-run.md` → delete

The dry-run design doc is fully superseded by this change's spec and the existing `displayPlan`/`applyPlan` implementations. Delete rather than rename — the spec is the source of truth.

**Alternative considered**: Rename to `plan-confirm-apply.md`. Rejected because the design doc's content (state reconciliation architecture) is already implemented and specified. Keeping it creates a second source of truth.

### 6. `WorkspaceContextOptions` stores `preview`

Add `preview: boolean` to `WorkspaceContextOptions` alongside `yes` and `nonInteractive`. This keeps all resolution flags together at service construction and avoids `resolvePlan` needing a separate options argument.

The method signature simplifies to:

```typescript
readonly resolvePlan: <Op>(plan: Plan<Op>) => Effect.Effect<void, PromptCancelled | PromptError, Clack>;
```

Callers do `yield* ws.resolvePlan(plan)` — no args beyond the plan.

**Alternative considered**: Pass `{ preview }` to `resolvePlan` at call site. Rejected because `preview` is a command-level flag, not a per-plan decision. It's known at the same time as `yes` and `nonInteractive` and should live alongside them.

## Risks / Trade-offs

**[Risk] Breaking E2E tests that use `--dry-run`** → All E2E tests updated in the same change. The flag rename is mechanical — search-and-replace `--dry-run` → `--preview` in test files.

**[Risk] External docs/scripts referencing `--dry-run`** → The root `proposal.md` is updated. Archived changes are left untouched (historical records). No external consumers exist yet.

**[Trade-off] Default applies without confirmation** → The user expressed intent by running the command. The plan is displayed for transparency, not as a gate. `--preview` exists for when you want to review before committing.

**[Trade-off] `resolvePlan` depends on `Clack`** → The interactive branch needs `Clack` for `confirm`. This is already a dependency of `WorkspaceContextService` construction, so no new dependency is introduced. The `preview` and `yes` branches don't use `Clack` for prompting (only for display), but the type signature includes it for the general case.

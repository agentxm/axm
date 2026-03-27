## Context

`@axm.sh/core` currently holds the domain data layer: schemas, types, I/O for settings/lockfile/extensions/sources/agents, plus CLI infrastructure (prompts, rendering, flags, error handling, telemetry). `@axm.sh/cli` holds both command wiring AND the domain service layer — extension management, workspace orchestration, registry access, auth, source resolution, git operations.

The goal is to move the domain service layer into core so non-CLI consumers (APIs, SDKs, GUIs) can use it. The CLI becomes a thin presentation layer that wires commands to core services.

Dependency analysis confirms no circular dependencies between the modules being moved. The dependency graph flows: git → registry → auth → workspace → sources → extensions → workflows (command-level).

Two cross-cutting concerns exist:

1. `discoverSkillsInDir` lives in `root/skills/install/` but is imported by `workspace/` and `sources/`. It's pure business logic (filesystem-based skill discovery) that must move to core alongside the modules that depend on it.
2. `agents/` (`CodingAgentRepository`, `CodingAgent`) is imported by `extensions/skills/` and `extensions/mcp-servers/` for agent symlink management. Agent service types need to be available in core.

## Goals / Non-Goals

**Goals:**

- Enable programmatic extension management without CLI dependency
- Move all domain services (workspace, extensions, registry, auth, sources, git) to `@axm.sh/core/unstable/*`
- Decompose `resolvePlan` into pure plan application (core) and interactive confirmation (CLI)
- Relocate `discoverSkillsInDir` to core as part of source/workspace dependencies
- Keep the migration incremental — each phase produces a working, lintable, testable codebase
- Move corresponding unit tests with their code

**Non-Goals:**

- Backward compatibility of import paths — CLI internal imports are not public API
- Stable API surface — everything stays under `unstable/*`
- Moving command workflows (`install-command/`, `uninstall-command/`) — deferred until `resolvePlan` decomposition settles
- Moving CLI-specific modules (`root/`, `builtin-pack/`, `dev-cli-commands/`, `cli-flags/`)
- Moving `agents/` service implementations — only the service interface/types that extension managers depend on
- Changing behavior — this is a structural refactoring

## Decisions

### 1. Three-phase migration order

**Decision:** Phase 1 (git, registry, auth) → Phase 2 (workspace, sources) → Phase 3 (extensions, operation workflows).

**Rationale:** Validated by dependency analysis. Phase 1 modules have zero internal CLI dependencies — they only import from `@axm.sh/core/unstable/*`. Phase 2 depends on Phase 1. Phase 3 depends on both. Each phase boundary is a clean cut where the codebase compiles and tests pass.

**Alternatives considered:**

- (a) Big-bang migration — move everything at once. Rejected: too large for a single reviewable change, harder to bisect regressions.
- (b) Module-by-module — move each folder individually. Rejected: creates more intermediate states and import churn. Phased grouping balances atomicity with manageability.

### 2. `discoverSkillsInDir` moves to core as a source/discovery utility

**Decision:** Extract `discoverSkillsInDir` from `root/skills/install/` into `@axm.sh/core/unstable/sources` (or a new `unstable/skill-discovery` module). Move its tests alongside it.

**Rationale:** It's pure business logic (scan a directory for skill manifests) with no CLI dependencies. Both `workspace/service.ts` and `sources/providers/` depend on it. Leaving it in `root/` would create a reverse dependency from core to CLI.

**Alternatives considered:**

- (a) Leave in CLI, have core modules accept it as a parameter. Rejected: adds ceremony to every call site and forces CLI to inject it.
- (b) Abstract behind a service interface. Rejected: overengineered for a pure function.

### 3. `resolvePlan` decomposition

#### Current state

`resolvePlan` is a method on the `WorkspaceContextService` interface. It takes a `Plan` and `{ yes, force, preview }` flags and returns `Effect<ExecutedPlan, PromptCancelled | AppError, CliEnvironment>`. It performs five responsibilities in sequence:

1. **Augment** — `augmentPlanWithReconciliation(plan, ...)` detects lockfile drift (missing/invalid) and prepends recovery steps to the plan. Pure plan manipulation, except for one `renderer.warn()` call.
2. **Scan readiness** — iterates all steps, collects error/warn counts and messages. Pure computation over the augmented plan.
3. **Handle errors/warnings** — if errors exist, either fail with `PLAN_BLOCKED_BY_ERRORS` or (with `--force`) downgrade to warnings. Warnings are logged via `renderer.warn()`. This is policy + presentation.
4. **Preview/confirm** — if `--preview`, display the plan via `displayPlan()`, then optionally prompt for confirmation via `prompt.confirm()`. Display-only in non-interactive mode without `--yes`. This is entirely presentation-layer.
5. **Apply + display** — calls `applyPlan(augmentedPlan)` (already a separate pure function), then `displayPlan(executed)`.

The `applyPlan` function (`apply-plan.ts`) is already cleanly separated: `Effect<ExecutedPlan, never, never>` — no services, no errors, no prompts. It executes step closures, handles inter-job blocking and intra-job continuation.

`displayPlan` (`display-plan.ts`) depends on `CliRenderer` and `CliEnvironment` — inherently CLI-specific.

`augmentPlanWithReconciliation` is a private function in `service.ts` that takes `renderer`, `getLockfileState`, `readSettingsSafe`, `fsLayer` as explicit params. Its only presentation-layer coupling is one `renderer.warn("LOCKFILE_INVALID_RECONCILE")` call.

#### Decomposition

**Moves to core (`@axm.sh/core/unstable/workspace`):**

- **Plan types** — `Plan`, `ExecutedPlan`, `PlannedJobStep`, `CompletedJobStep`, `JobStepResult`, `Job`, etc. from `plan.ts`. These are pure data types with no dependencies.
- **`applyPlan`** — from `apply-plan.ts`. Already `Effect<ExecutedPlan, never, never>` with zero service requirements. Moves as-is.
- **`augmentPlanWithReconciliation`** — refactored to remove the `renderer` parameter. The single `renderer.warn()` call becomes a returned signal (e.g., the augmented plan includes metadata indicating reconciliation was triggered) that the CLI wrapper can log. After this change, `augmentPlanWithReconciliation` is pure: `(plan, getLockfileState, ...) => Effect<Plan, AppError>`.
- **`scanPlanReadiness`** — extracted as a new pure function that returns a `PlanReadinessReport` (error count, warn count, error messages, warn messages). Currently inlined in `resolvePlan` as ad-hoc iteration. Making it a named function enables non-CLI consumers to inspect plan readiness without the CLI policy/presentation logic.

**Stays in CLI:**

- **`resolvePlan`** — remains as a CLI-specific orchestration function that composes core's building blocks with CLI presentation:
  ```
  augmentPlanWithReconciliation(plan)  // core
    → scanPlanReadiness(augmented)     // core
    → handle errors/warnings           // CLI policy + renderer
    → preview/confirm                  // CLI prompts
    → applyPlan(augmented)             // core
    → displayPlan(executed)            // CLI renderer
  ```
- **`displayPlan`** — depends on `CliRenderer` and `CliEnvironment`. Stays in CLI.
- **Interactive confirmation** — `prompt.confirm()` call. Stays in CLI.

#### How CLI exposes `resolvePlan`

`resolvePlan` is called from ~15 call sites across CLI handlers and command workflows. All follow the same pattern today:

```typescript
const ws = yield * Workspace;
yield * ws.resolvePlan(plan, flags);
```

After decomposition, the core `WorkspaceContextService` no longer has `resolvePlan`. Three options for how CLI provides it:

##### Option A: Free function (recommended)

`resolvePlan` becomes a standalone effectful function in CLI that yields the services it needs:

```typescript
// cli/src/workspace/resolve-plan.ts (stays in CLI)
export const resolvePlan = (
  plan: Plan,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;          // core service
    const renderer = yield* CliRenderer;  // CLI service
    const prompt = yield* CliPrompt;      // CLI service
    const env = yield* CliEnvironment;    // CLI service

    // 1. Augment with lockfile reconciliation (core)
    const augmented = yield* ws.augmentPlan(plan);
    if (augmented.reconciliationTriggered) {
      yield* renderer.warn(`Lockfile ${augmented.reason}: reconciling`);
    }

    // 2. Scan readiness (core — pure function)
    const report = scanPlanReadiness(augmented.plan);

    // 3. Handle errors/warnings (CLI policy + renderer)
    if (report.hasErrors && !flags.force) {
      yield* displayPlan(augmented.plan);
      return yield* makeAppError({ code: "PLAN_BLOCKED_BY_ERRORS", ... });
    }
    yield* Effect.forEach(report.warnMessages, (msg) => renderer.warn(msg));

    // 4. Preview/confirm (CLI prompts)
    if (flags.preview) {
      yield* displayPlan(augmented.plan);
      if (env.nonInteractive && !flags.yes) return emptyExecutedPlan(plan);
      if (!flags.yes && !env.nonInteractive) {
        const confirmed = yield* prompt.confirm({ message: "Apply changes?" });
        if (!confirmed) return emptyExecutedPlan(plan);
      }
    }

    // 5. Apply + display (core apply, CLI display)
    const executed = yield* ws.applyPlan(augmented.plan);
    yield* displayPlan(executed);
    return executed;
  });
```

Call sites change from `ws.resolvePlan(plan, flags)` to `resolvePlan(plan, flags)`:

```typescript
// Before (handler today)
const ws = yield * Workspace;
yield * ws.resolvePlan(plan, { yes, force, preview });

// After
yield * resolvePlan(plan, { yes, force, preview });
```

**Pros:**

- Simplest — no service wrapping, no extended interfaces, no layer composition
- Call sites get shorter (no need to yield `Workspace` just for `resolvePlan`)
- CLI-specificity is explicit — it's a function in CLI, not a method on a core service
- The function declares its own service requirements via `yield*` — callers don't need to know what it needs
- Easy to test — provide mock layers for Workspace, CliRenderer, CliPrompt

**Cons:**

- ~15 call sites change import + call pattern (mechanical, but touches many files)
- Handlers that also use `ws` for other methods now have a split: `yield* Workspace` for core methods, `resolvePlan(...)` as a free function

##### Option B: Extended CLI service

Define a `CliWorkspace` service in CLI that wraps core's `Workspace` and adds `resolvePlan`:

```typescript
// cli/src/workspace/cli-workspace.ts
interface CliWorkspaceService extends WorkspaceContextService {
  readonly resolvePlan: (
    plan: Plan,
    flags: { yes: boolean; force: boolean; preview: boolean },
  ) => Effect.Effect<ExecutedPlan, PromptCancelled | AppError>;
}

class CliWorkspace extends ServiceMap.Service<CliWorkspace, CliWorkspaceService>()(
  "@axm.sh/cli/CliWorkspace",
) {}

// Layer: wraps core Workspace + CLI services into CliWorkspace
const CliWorkspaceLive = Layer.effect(
  CliWorkspace,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;
    const prompt = yield* CliPrompt;
    const env = yield* CliEnvironment;
    return {
      ...ws, // spread all core methods
      resolvePlan: (plan, flags) => {
        /* orchestration logic */
      },
    };
  }),
);
```

Call sites barely change — just the service tag:

```typescript
// Before
const ws = yield * Workspace;
yield * ws.resolvePlan(plan, flags);

// After
const ws = yield * CliWorkspace;
yield * ws.resolvePlan(plan, flags);
```

**Pros:**

- Minimal call-site churn — same `ws.resolvePlan(...)` pattern
- Handlers that use both workspace methods and `resolvePlan` use a single service
- Familiar service pattern for this codebase

**Cons:**

- Introduces a new service + layer + interface for what is essentially one function
- `CliWorkspace` must re-export every core `Workspace` method (via spread or delegation)
- Two Workspace-like services in the codebase — risk of confusion about which to use
- Layer wiring gets more complex (CliWorkspace depends on Workspace + CliRenderer + CliPrompt + CliEnvironment)
- If core `WorkspaceContextService` adds a method, `CliWorkspaceService` must update too

##### Option C: Separate `PlanResolver` service

Define a dedicated `PlanResolver` service in CLI with just `resolvePlan`:

```typescript
// cli/src/workspace/plan-resolver.ts
interface PlanResolverService {
  readonly resolvePlan: (
    plan: Plan,
    flags: { yes: boolean; force: boolean; preview: boolean },
  ) => Effect.Effect<ExecutedPlan, PromptCancelled | AppError>;
}

class PlanResolver extends ServiceMap.Service<PlanResolver, PlanResolverService>()(
  "@axm.sh/cli/PlanResolver",
) {}
```

Call sites yield two services:

```typescript
// Before
const ws = yield * Workspace;
yield * ws.resolvePlan(plan, flags);

// After
const resolver = yield * PlanResolver;
yield * resolver.resolvePlan(plan, flags);
// (and separately: const ws = yield* Workspace; for other methods)
```

**Pros:**

- Clean separation — PlanResolver is explicitly its own concept
- No inheritance or wrapping of Workspace
- Testable independently

**Cons:**

- Most ceremony — new service, new layer, new interface for one method
- Handlers that use both Workspace and PlanResolver yield two services
- `yield* PlanResolver` + `resolver.resolvePlan(plan, flags)` is more verbose than a free function `resolvePlan(plan, flags)` for the same result

##### Decision: Option A (free function)

Option A is the simplest approach that correctly models the situation. `resolvePlan` is a CLI-specific orchestration step, not a service with state or identity — making it a service (Options B/C) adds abstraction without benefit. The ~15 call-site changes are mechanical (find-and-replace the pattern) and the result is actually shorter code at each site. The `R` requirements of the free function are automatically tracked by Effect's type system, so callers get compile-time safety without explicit service wiring.

#### Why not parameterize instead of split

An alternative is to keep `resolvePlan` in core but parameterize the interactive parts (pass in a `confirm` callback, a `display` callback, etc.). Rejected because:

- It forces core to model CLI-specific control flow (preview mode, non-interactive dry-run, --yes semantics)
- The flag semantics (`preview` without `--yes` = display-only in non-interactive) are CLI policy, not domain logic
- Parameterization doesn't actually decouple — it just moves the coupling to the call site while keeping the orchestration in core
- A non-CLI consumer (API, SDK) wouldn't use this control flow at all — they'd call `applyPlan` directly, possibly after their own validation

### 4. Agent service types extracted as an interface in core

**Decision:** Define a `CodingAgentRepository` service interface in core (alongside the agent types that are already there). The concrete implementation (`DefaultCodingAgentRepository`) stays in CLI and is provided via Effect layers. Extension managers in core depend on the interface.

**Rationale:** Extension managers (skills, mcp-servers) need agent repository access for symlink management. The agent descriptors and IDs are already in core. Only the repository service (which wires up agent-specific filesystem operations) needs an interface in core.

**Alternatives considered:**

- (a) Move the full `agents/` module to core. Rejected: agent services include CLI-specific concerns (coding agent detection, MCP sync) beyond what extension managers need.
- (b) Pass agent info as parameters to each manager method. Rejected: too much plumbing — the service pattern is idiomatic for this codebase.

### 5. New core export paths follow existing conventions

**Decision:** Each moved module gets a `@axm.sh/core/unstable/<module>` export path, matching the existing pattern. Specific paths:

| Module                             | Export path                                                      |
| ---------------------------------- | ---------------------------------------------------------------- |
| git                                | `@axm.sh/core/unstable/git`                                      |
| registry                           | `@axm.sh/core/unstable/registry`                                 |
| auth                               | `@axm.sh/core/unstable/auth`                                     |
| workspace                          | `@axm.sh/core/unstable/workspace`                                |
| sources (providers + resolution)   | `@axm.sh/core/unstable/source-resolution`                        |
| extensions (managers + operations) | `@axm.sh/core/unstable/extension-managers`                       |
| operation workflows                | `@axm.sh/core/unstable/extension-operations`                     |
| skill discovery                    | `@axm.sh/core/unstable/skill-discovery` (or folded into sources) |

**Rationale:** Consistent with existing core exports (`unstable/settings`, `unstable/lockfile`, etc.). Each export path maps to a barrel `index.ts`.

### 6. Lockfile reconciliation augmentation moves with workspace

**Decision:** `augmentPlanWithReconciliation` moves to core as part of the workspace module. The `renderer` parameter is removed — the single `renderer.warn()` call is replaced by a returned signal in the result type (e.g., `AugmentedPlanResult { plan: Plan; reconciliationTriggered: boolean; reason?: "missing" | "invalid" }`). The CLI wrapper reads this signal and logs accordingly.

**Rationale:** Plan augmentation is domain logic (detect lockfile drift, generate recovery steps). The only presentation coupling is one warning log. Returning a signal instead of calling the renderer directly makes the function pure and testable without renderer mocks. See Decision 3 for how this fits into the `resolvePlan` decomposition.

### 7. Phase 2 moves workspace before sources

**Decision:** Within Phase 2, move workspace first, then sources. Sources depend on workspace (for `Workspace` service access), but workspace does not depend on sources.

**Rationale:** One-way dependency. Moving workspace first means sources can import from `@axm.sh/core/unstable/workspace` when they move.

## Risks / Trade-offs

**Increased core package size** → Core grows significantly. Mitigated by keeping everything under `unstable/*` — consumers opt in explicitly. Tree-shaking via separate entry points keeps bundle impact minimal.

**New dependencies on core** → Registry client needs HTTP client; git operations need child process spawning. Mitigated: core already depends on `@effect/platform-node` which provides both. No new package dependencies expected.

**Import path churn in CLI** → Every internal import in CLI that references a moved module changes from relative to `@axm.sh/core/unstable/*`. Mitigated: mechanical find-and-replace, verified by TypeScript compilation. Done per-phase so diffs are reviewable.

**Test migration risk** → Tests that depend on CLI-internal test helpers or fixtures may break when moved. Mitigated: move test helpers that are needed in core. CLI E2E tests don't move — they stay in `cli-e2e/`.

**`discoverSkillsInDir` placement** → Currently lives under `root/skills/install/` which is a command handler path. Moving it to core changes its organizational home. Mitigated: it was always misplaced — it's used by sources and workspace, not by the install handler directly.

**Intermediate states during phased migration** → Between phases, some code lives in core while related code still lives in CLI. Mitigated: each phase boundary is a clean compilation and test pass. No phase leaves dangling imports.

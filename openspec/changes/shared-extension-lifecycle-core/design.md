## Context

Current install/uninstall flows have repeated logic across `skill` and `pack` operations for:

- state diffing against `SettingsDocument` and `LockfileDocument`
- skip/preserve reasoning
- preview/apply parity
- materialization sequencing

Command handlers also repeat orchestration phases:

- parse source input
- resolve source host/source
- discover `ExtensionRef` candidates
- build command-local intent/plan metadata

This repeated logic causes behavioral drift and bug classes where one extension type updates lockfile/settings differently than another.

This design does not change the existing `ExtensionRef` shape from `sources/types.ts`; all workflow logic derives operation targets from current `ExtensionRef` fields (`type`, `refType`, source-specific name fields).

The ontology model already gives stable concepts for this refactor:

- `ExtensionType` (`skill`, `pack`)
- `SourceType` and `RefType`
- `ExtensionRef` (discovery projection)
- `PackagingKind` (`native`, `non-native`)
- workspace entities (`SettingsDocument`, `LockfileDocument`)

## Goals / Non-Goals

**Goals**

- Centralize install/uninstall state update semantics for settings + lockfile.
- Keep command handlers thin and preserve plan/job orchestration semantics.
- Isolate type-specific behavior in per-type hooks.
- Support pack cross-type orchestration without hard-coding dependency side effects in pack handlers.
- Preserve deterministic preview/apply behavior and idempotency.

**Non-Goals**

- Reworking publish/update/fork flows.
- Replacing plan/job semantics or user-visible preview/apply behavior.
- Introducing inheritance-heavy domain class hierarchy as the core abstraction.

## CLI Behavior Notes

- `skills install --list` is removed in this migration; discovery-only inspection should use `--preview`.
- `skills install --agent` and `skills uninstall --agent` are removed in this migration; operations are workspace-scoped. Skill materialization creates agent symlinks for all agents returned by `ws.getConfiguredAgents()` (the workspace's configured agent list from settings).
- Install diagnostics remain visible (source resolution, registry probe outcomes, selected host), but are rendered via command-workflow diagnostics hooks.
- Pack migration in this change stays focused on skill dependencies; command/mcp-server dependency installation remains deferred.
- Existing `command` / `mcp-server` pack behavior stays on legacy paths until those types are explicitly migrated.

## Architecture

### 1) Shared Lifecycle Core (common)

The lifecycle core is not a separate kernel file; it is the evolved `resolvePlan`/`applyPlan` pipeline plus the shared operation workflows (`buildInstallOperation`, `buildUninstallOperation`).

Three-stage flow (composed by command-family workflows):

1. `finalizeIntent` (workflow-provided)
2. operation-level planning from finalized intent (workflow-provided, produces `PlannedJobStep` steps with `run` closures)
3. `resolvePlan` → preview/confirm → `applyPlan` (executes `run` effects directly)

`resolvePlan`/`applyPlan` responsibilities:

- display plan for preview/confirmation
- execute `run` effects for ready steps in job order
- promote error steps to error results without execution
- return plan with `JobStepResult` per step

### 1b) Command-Family Workflows (SRP)

Define one workflow per command family and compose each from shared command primitives.

Examples:

- `runInstallCommandWorkflow` (shared by supported install handlers in this change)
- `runUninstallCommandWorkflow` (shared by supported uninstall handlers in this change)

Each family workflow may use different phases while reusing common primitives (`parse`, `resolveSource`, `discover`, `finalizeIntent`, `resolvePlan`).

Install-family workflows should also support command-level diagnostics rendering (for source resolution and registry host probing) without coupling diagnostics to operation hooks.

Rationale:

- Preserve SRP at command-family level.
- Avoid a single cross-family workflow with many optional/no-op hooks.
- Keep command-specific UX explicit; input validation/normalization happens before operation execution.

Critical rule:

- Operation hooks expose type-specific settings/lockfile mutation methods.
- Shared operation workflows call hook mutation methods in canonical order.
- `resolvePlan` / `applyPlan` execute per-step `run` effects for ready job steps directly (no handler registry maps).
- `resolvePlan` must block apply when any planned step has `readiness === "error"`.

### 1c) `resolvePlan` / `applyPlan` Evolution

The existing `resolvePlan(plan, handlerMap)` signature evolves to `resolvePlan(plan)` (no handler map). Steps carry their own `run` effect closures; `applyPlan` executes them directly instead of dispatching through a name-keyed handler registry.

Changes:

- `PlannedJobStep` gains a `run` closure (for ready steps) and loses its `operation` payload.
- `applyPlan` iterates steps: for each ready step, invokes `step.run()`; for each error step, promotes to an error result.
- The existing `Operation`, `OperationMap`, and `defineOperationMetadata` registries are removed.
- Plan augmentation (`augmentPlan`) is removed in this change. Lockfile recovery behavior is out of scope and can be reintroduced as a pre-plan check if needed later.

### 2) Operation Hook Contract (type-specific lifecycle)

Introduce per-`ExtensionType` lifecycle hooks:

- materialization methods
- type-specific settings/lockfile mutation methods

Command-family workflows own parse/resolve/discover phases. Lifecycle hooks do not parse CLI input and do not perform source-host discovery.

Hooks to implement in scope:

- `skill` hooks
- `pack` hooks

No-op placeholders in scope:

- `mcp-server` integration points remain explicit no-ops
- `command` integration points remain explicit no-ops

Add shared command primitives (separate from lifecycle operation hooks):

- `parse*`
- `resolveSource*`
- `discover*`
- `finalize*Intent`

Install-family requires a `buildPlan` hook.

- Simple install handlers (for example `skills install`) should provide a tiny inline builder.
- Complex install handlers (notably packs) can provide an advanced builder.

Uninstall-family keeps a hookable plan path (`buildUninstallPlan`) because uninstall semantics diverge by command.

Command-family workflows compose these primitives directly (no single cross-family hook interface).

### 3) Intent Model

Use command-specific immutable intents (owned by each command folder), not one shared global intent type.

Examples:

- `cli-commands/skills/install/intent.ts` -> `InstallSkillCommandIntent`
- `cli-commands/skills/uninstall/intent.ts` -> `UninstallSkillCommandIntent`
- `cli-commands/packs/install/intent.ts` -> `InstallPackCommandIntent`
- `cli-commands/packs/uninstall/intent.ts` -> `UninstallPackCommandIntent`

Pack install intent identifies the selected pack; dependency expansion happens in `buildPlan` for supported types.

Dependency-preservation policy for uninstall is evaluated inside `runUninstallOperation`. Plan builders emit uninstall operations directly; operation execution decides whether to remove from disk or keep materialized when still required by an installed pack.

Uninstall targets must be derived with lockfile-backed context during `finalizeIntent` / `buildUninstallPlan` (including namespace when available) so dependency checks are deterministic.

### 3b) Term Glossary

- `ExtensionRef`: discovery output from sources (`type`, `refType`, source-backed fields).
- `*CommandIntent`: command-local decision payload after selection/filtering.
- `ExtensionTarget`: normalized execution target used by uninstall/runtime policy checks.
- Install operations are `ExtensionRef`-driven.
- Uninstall operations are lockfile-backed `ExtensionTarget`-driven.
- `PlannedJobStep`: existing plan type, evolved to `ReadyJobStep | ErrorJobStep` (no `operation` payload on steps). The existing `skip` and `warn` readiness states are removed; operations are assumed idempotent (re-running an already-applied operation is a safe no-op).

### 4) Operation Execution Model

Canonical execution unit is the user-meaningful operation (`install-skill`, `uninstall-pack`, etc.).

- Planning unit: `PlannedJobStep`
- Execution unit: operation `run` effects (`runInstallOperation` / `runUninstallOperation`)
- Internal implementation detail: operation workflow steps (for example materialize, lockfile update, settings update)

`SettingsDocument` and `LockfileDocument` ownership:

- Operation workflows (shared install/uninstall operation abstractions) are the only place that decides sequencing and dependency-retention policy.
- Extension hooks provide type-specific materialization and settings/lockfile mutation methods invoked by those workflows.

### 4b) Output Model (operation-oriented rendering)

Default CLI output renders operation outcomes directly.

- Default render unit: operation outcome (`label` + result)
- Debug/verbose render unit: optional operation-level diagnostic logs

Render rules:

1. Preserve plan step order for operation outcome rendering.
2. Render readiness errors as non-runnable plan steps.
3. Render one `JobStepResult` per ready planned job step `run` effect.

This keeps CLI output aligned with user-meaningful operations while allowing finer-grained debug traces.

### 5) Target Scope placeholders for `mcp-server` and `command`

In this change, `mcp-server` and `command` lifecycle integration is intentionally no-op.

- The shared operation workflows and `ExtensionHooks` type keep extension points for future target-scoped behavior.
- No `mcp-server` or `command` operation execution behavior changes are introduced.

### 6) Skill Native vs Non-Native

Skill hooks branch by `PackagingKind`:

- `native`: native-specific materialization/reconciliation behavior
- `non-native`: source-backed behavior

Branching is inside hook/profile strategy, not in shared kernel.

### 7) Pack Cross-Type Behavior

Pack install/uninstall does not directly call other handlers.

- Pack plan builders expand cross-type execution targets.
- Shared executor applies extension hooks for materialization and state updates.

This keeps pack orchestration composable while preserving shared operation execution rules.

## Pseudocode

### `packages/cli/src/workflows/install-command/workflow.ts`

```ts
export const runInstallCommandWorkflow = <Args, Parsed, Req, Ref, Intent>(
  args: Args,
  hooks: {
    parseArgs: (args: Args) => Effect.Effect<Parsed, CliError>;
    resolveSourceRequests: (parsed: Parsed) => Effect.Effect<ReadonlyArray<Req>, CliError>;
    discoverRefs: (reqs: ReadonlyArray<Req>) => Effect.Effect<ReadonlyArray<Ref>, CliError>;
    emitDiagnostics: (args: {
      readonly parsed: Parsed;
      readonly sourceRequests: ReadonlyArray<Req>;
      readonly refs: ReadonlyArray<Ref>;
    }) => Effect.Effect<void, never>;
    finalizeIntent: (parsed: Parsed, refs: ReadonlyArray<Ref>) => Effect.Effect<Intent, CliError>;
    buildPlan: (intent: Intent) => Effect.Effect<Plan, CliError>;
  },
) =>
  Effect.gen(function* () {
    const parsed = yield* hooks.parseArgs(args);
    const sourceRequests = yield* hooks.resolveSourceRequests(parsed);
    const refs = yield* hooks.discoverRefs(sourceRequests);
    yield* hooks.emitDiagnostics({ parsed, sourceRequests, refs });
    const intent = yield* hooks.finalizeIntent(parsed, refs);
    const plan = yield* hooks.buildPlan(intent);
    const ws = yield* Workspace;
    yield* ws.resolvePlan(plan);
  });
```

### `packages/cli/src/workflows/uninstall-command/workflow.ts`

```ts
export const runUninstallCommandWorkflow = <Args, Parsed, Intent>(
  args: Args,
  hooks: {
    parseArgs: (args: Args) => Effect.Effect<Parsed, CliError>;
    finalizeIntent: (parsed: Parsed) => Effect.Effect<Intent, CliError>;
    buildUninstallPlan: (intent: Intent) => Effect.Effect<Plan, CliError>;
  },
) =>
  Effect.gen(function* () {
    const parsed = yield* hooks.parseArgs(args);
    const intent = yield* hooks.finalizeIntent(parsed);
    const plan = yield* hooks.buildUninstallPlan(intent);
    const ws = yield* Workspace;
    yield* ws.resolvePlan(plan);
  });
```

### `packages/cli/src/workflows/install-operation/workflow.ts`

```ts
// Evolution of existing PlannedJobStep (not a new parallel type).
// The previous `skip` and `warn` readiness states are removed; operations
// are idempotent so re-running an already-applied operation is a safe no-op.
type ReadyJobStep = {
  readonly label: string;
  readonly readiness: "ready";
  readonly run: () => Effect.Effect<JobStepResult, CliError, Workspace>;
};

type ErrorJobStep = {
  readonly label: string;
  readonly readiness: "error";
  readonly message: string;
};

type PlannedJobStep = ReadyJobStep | ErrorJobStep;

// Replaces the existing OperationResult. Single result type for all step outcomes.
type JobStepResult = {
  readonly result: "success" | "no-op" | "error";
  readonly message: string;
};

// Per-extension-type target types (discriminated union).
type SkillExtensionTarget = {
  readonly type: "skill";
  readonly name: string;
  readonly namespace: Option.Option<string>;
};

type PackExtensionTarget = {
  readonly type: "pack";
  readonly name: string;
  readonly namespace: Option.Option<string>;
};

type CommandExtensionTarget = {
  readonly type: "command";
  readonly name: string;
  readonly namespace: Option.Option<string>;
};

type McpServerExtensionTarget = {
  readonly type: "mcp-server";
  readonly name: string;
  readonly namespace: Option.Option<string>;
};

type ExtensionTarget =
  | SkillExtensionTarget
  | PackExtensionTarget
  | CommandExtensionTarget
  | McpServerExtensionTarget;

type ExtensionTargetFor<TRef extends ExtensionRef> = Extract<
  ExtensionTarget,
  { readonly type: TRef["type"] }
>;

const targetFromRef = (ref: ExtensionRef): ExtensionTarget => {
  const namespace = ref.refType === "registry" ? Option.some(ref.namespace) : Option.none<string>();

  switch (ref.type) {
    case "skill":
      return { type: "skill", name: ref.skill.name, namespace };
    case "pack":
      return { type: "pack", name: ref.pack.name, namespace };
    case "command":
      return { type: "command", name: ref.command.name, namespace };
    case "mcp-server":
      return { type: "mcp-server", name: ref.server.name, namespace };
  }
};

type InstallOperationArgs<TRef extends ExtensionRef> = {
  readonly ref: TRef;
};

type ExtensionHooks<TRef extends ExtensionRef> = {
  readonly extensionType: TRef["type"];
  readonly materializeInstall: (args: { readonly ref: TRef }) => Effect.Effect<void, CliError>;
  readonly materializeUninstall: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, CliError>;
  readonly upsertSettingsEntry: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, CliError, Workspace>;
  readonly removeSettingsEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, CliError, Workspace>;
  readonly upsertLockfileEntry: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, CliError, Workspace>;
  readonly removeLockfileEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, CliError, Workspace>;
};

// Hook mutation methods are thin wrappers that delegate to existing
// WorkspaceContextService methods (e.g. ws.setSkill, ws.removeSkill),
// preserving semaphore serialization. See skill hooks pseudocode below.

export const buildInstallOperation = <TRef extends ExtensionRef>(
  extensionHooks: ExtensionHooks<TRef>,
  args: InstallOperationArgs<TRef>,
): ReadyJobStep => {
  const ref = args.ref;
  const target = targetFromRef(ref);

  return {
    label: target.name,
    readiness: "ready",
    run: () => runInstallOperation(extensionHooks, args),
  };
};

const runInstallOperation = <TRef extends ExtensionRef>(
  hooks: ExtensionHooks<TRef>,
  args: InstallOperationArgs<TRef>,
) =>
  Effect.gen(function* () {
    yield* hooks.materializeInstall({ ref: args.ref });
    yield* hooks.upsertLockfileEntry({ ref: args.ref });
    yield* hooks.upsertSettingsEntry({ ref: args.ref });
    return { result: "success", message: "Applied install operation" } satisfies JobStepResult;
  });
```

**Failure semantics:** If a step's `run` effect fails (returns a `CliError`), the step is marked as errored in the plan results. Remaining steps in the same job continue executing (no early abort). Partial state (e.g. materialized on disk but not locked) is acceptable; idempotent re-runs and lockfile reconciliation handle recovery.

### `packages/cli/src/workflows/uninstall-operation/workflow.ts`

```ts
type UninstallOperationArgs<TRef extends ExtensionRef> = {
  readonly target: ExtensionTargetFor<TRef>;
};

export const buildUninstallOperation = <TRef extends ExtensionRef>(
  extensionHooks: ExtensionHooks<TRef>,
  args: UninstallOperationArgs<TRef>,
): ReadyJobStep => {
  const target = args.target;

  return {
    label: target.name,
    readiness: "ready",
    run: () => runUninstallOperation(extensionHooks, args),
  };
};

const runUninstallOperation = <TRef extends ExtensionRef>(
  hooks: ExtensionHooks<TRef>,
  args: UninstallOperationArgs<TRef>,
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const stillRequiredByPack = yield* ws.isExtensionRequiredByInstalledPack(args.target);

    if (stillRequiredByPack) {
      yield* ws.removeExplicitConfigIntent(args.target);
      yield* ws.markDependencyRetainedInLockfile(args.target);
      return {
        result: "no-op",
        message: "Kept on disk because dependency is still required by an installed pack",
      } satisfies JobStepResult;
    }

    yield* hooks.materializeUninstall({ target: args.target });
    yield* hooks.removeLockfileEntry({ target: args.target });
    yield* hooks.removeSettingsEntry({ target: args.target });
    return { result: "success", message: "Applied uninstall operation" } satisfies JobStepResult;
  });
```

### `packages/cli/src/cli-commands/skills/install/`

```ts
// handler.ts
export const handleSkillsInstall = (args: SkillsInstallHandlerArgs) =>
  runInstallCommandWorkflow(args, {
    parseArgs: parseSkillInstallArgs,
    resolveSourceRequests: resolveSkillInstallSources,
    discoverRefs: discoverSkillRefs,
    emitDiagnostics: emitSkillInstallDiagnostics,
    finalizeIntent: finalizeSkillInstallIntent,
    buildPlan: buildSkillInstallPlan,
  });

// intent.ts
export type InstallSkillCommandIntent = {
  readonly skillsToInstall: ReadonlyArray<SkillExtensionRef>;
};

// finalize-intent.ts
export const finalizeSkillInstallIntent = (
  parsed: ParsedSkillInstallArgs,
  discoveredRefs: ReadonlyArray<SkillExtensionRef>,
) =>
  Effect.gen(function* () {
    const selected = yield* selectSkillsForInstall({
      requestedSkills: parsed.skills,
      discovered: discoveredRefs,
      all: parsed.all,
      yes: parsed.yes,
    });
    return {
      skillsToInstall: selected.map((x) => x.ref),
    } satisfies InstallSkillCommandIntent;
  });

// build-plan.ts
export const buildSkillInstallPlan = (intent: InstallSkillCommandIntent) =>
  Effect.succeed({
    name: "Install skill(s)",
    jobs: [
      {
        concurrency: 1,
        steps: intent.skillsToInstall.map((ref) =>
          buildInstallOperation(skillHooks, {
            ref,
          }),
        ),
      },
    ],
  } satisfies Plan);
```

### `packages/cli/src/cli-commands/packs/install/`

```ts
// intent.ts
export type InstallPackCommandIntent = {
  readonly packToInstall: PackExtensionRef;
};

// handler.ts
export const handlePacksInstall = (args: PacksInstallHandlerArgs) =>
  runInstallCommandWorkflow(args, {
    parseArgs: parsePackInstallArgs,
    resolveSourceRequests: resolvePackInstallSources,
    discoverRefs: discoverPackRefs,
    emitDiagnostics: emitPackInstallDiagnostics,
    finalizeIntent: buildPackInstallIntent,
    buildPlan: buildPackInstallPlan,
  });

// build-plan.ts
export const buildPackInstallPlan = (
  intent: InstallPackCommandIntent,
): Effect.Effect<Plan, CliError> =>
  Effect.gen(function* () {
    const refs: ReadonlyArray<ExtensionRef> = yield* expandPackInstallRefs({
      pack: intent.packToInstall,
      supportedDependencyTypes: ["skill"],
    });

    const steps = refs.map((ref): PlannedJobStep => {
      if (ref.type !== "pack" && ref.type !== "skill") {
        const target = targetFromRef(ref);
        return {
          label: target.name,
          readiness: "error",
          message: `Unsupported dependency type: ${ref.type}`,
        };
      }

      if (ref.type === "pack") {
        return buildInstallOperation<PackExtensionRef>(packHooks, { ref });
      }

      return buildInstallOperation<SkillExtensionRef>(skillHooks, { ref });
    });

    return {
      name: "Install pack",
      jobs: [{ concurrency: 1, steps }],
    } satisfies Plan;
  });
```

### `packages/cli/src/cli-commands/skills/uninstall/`

```ts
// intent.ts
export type UninstallSkillCommandIntent = {
  readonly skillsToUninstall: ReadonlyArray<{ readonly skillName: string }>;
};

// build-uninstall-plan.ts
export const buildSkillUninstallPlan = (intent: UninstallSkillCommandIntent) =>
  Effect.gen(function* () {
    const targets = yield* resolveSkillUninstallTargetsFromLockfile(intent.skillsToUninstall);

    return {
      name: "Uninstall skill(s)",
      jobs: [
        {
          concurrency: 1,
          steps: targets.map((target) =>
            buildUninstallOperation(skillHooks, {
              target,
            }),
          ),
        },
      ],
    } satisfies Plan;
  });
```

### `packages/cli/src/cli-commands/packs/uninstall/`

```ts
// intent.ts
export type UninstallPackCommandIntent = {
  readonly packToUninstall: PackExtensionTarget;
};

// build-uninstall-plan.ts
export const buildPackUninstallPlan = (
  intent: UninstallPackCommandIntent,
): Effect.Effect<Plan, CliError> =>
  Effect.gen(function* () {
    const targets = yield* expandPackUninstallTargets({
      pack: intent.packToUninstall,
      supportedDependencyTypes: ["skill"],
    });

    return {
      name: "Uninstall pack",
      jobs: [
        {
          concurrency: 1,
          steps: targets.map((target): PlannedJobStep => {
            if (target.type === "pack") {
              return buildUninstallOperation<PackExtensionRef>(packHooks, { target });
            }

            return buildUninstallOperation<SkillExtensionRef>(skillHooks, { target });
          }),
        },
      ],
    } satisfies Plan;
  });
```

### `packages/cli/src/extensions/skills/hooks.ts`

```ts
export const skillHooks: ExtensionHooks<SkillExtensionRef> = {
  extensionType: "skill",

  // Materialization: dispatch by PackagingKind, create agent symlinks for
  // all workspace-configured agents.
  materializeInstall: ({ ref }) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;
      const agents = yield* ws.getConfiguredAgents();
      const sanitizedName = sanitizeName(ref.skill.name);

      // Per-PackagingKind: resolve source, copy to canonical location
      const materialized = yield* materializeSkill(ref, sanitizedName);

      // Symlink to each configured agent's skills dir
      yield* Effect.forEach(
        agents,
        (agentId) =>
          installForAgent({
            agentId,
            canonicalSkillSrcPath: materialized.skillSrcPath,
            sanitizedName,
          }),
        { concurrency: "unbounded" },
      );
    }),

  materializeUninstall: ({ target }) => uninstallSkillMaterialization(target.name),

  // Settings/lockfile hooks delegate to existing WorkspaceContextService methods,
  // preserving semaphore serialization.
  upsertSettingsEntry: ({ ref }) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;
      const agents = yield* ws.getConfiguredAgents();
      const lockEntry = sourceToLockEntry({
        ref,
        agents,
        now: new Date(),
        sourceName: Option.none(),
      });
      yield* ws.setSkill({
        name: ref.skill.name,
        lockEntry,
        versionConstraint: extractVersionConstraint(ref),
      });
    }),

  removeSettingsEntry: ({ target }) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;
      yield* ws.removeSkill(target.name);
    }),

  upsertLockfileEntry: ({ ref }) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;
      const agents = yield* ws.getConfiguredAgents();
      const lockEntry = sourceToLockEntry({
        ref,
        agents,
        now: new Date(),
        sourceName: Option.none(),
      });
      yield* ws.setSkillLock({ name: ref.skill.name, lockEntry, versionConstraint: Option.none() });
    }),

  removeLockfileEntry: ({ target }) =>
    Effect.gen(function* () {
      const ws = yield* Workspace;
      yield* ws.removeSkill(target.name);
    }),
};
```

### `packages/cli/src/extensions/packs/hooks.ts`

```ts
export const packHooks: ExtensionHooks<PackExtensionRef> = {
  extensionType: "pack",
  materializeInstall: ({ ref }) => installPack(ref),
  materializeUninstall: ({ target }) => uninstallPack(target.name),
  upsertSettingsEntry: ({ ref }) => upsertPackSettings(ref),
  removeSettingsEntry: ({ target }) => removePackSettings(target.name),
  upsertLockfileEntry: ({ ref }) => upsertPackLockfile(ref),
  removeLockfileEntry: ({ target }) => removePackLockfile(target.name),
};
```

## Effect and Immutability Constraints

- Planning (`finalizeIntent` -> `buildPlan`) is pure and immutable (`ReadonlyArray`, no push/mutation).
- Execution is `Effect`-based (`Effect.forEach`, deterministic concurrency where required).
- Use `Option`/Effect collection APIs; avoid mutable accumulators.

## Handler Impact Inventory

### Command handlers and command-family workflows

| Area                         | Path                                                             | Status            | Impact                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Install command workflow     | `packages/cli/src/workflows/install-command/workflow.ts`         | new               | Shared install command orchestration (`parse -> resolveSource -> discover -> finalizeIntent -> buildPlan hook -> resolvePlan`). |
| Uninstall command workflow   | `packages/cli/src/workflows/uninstall-command/workflow.ts`       | new               | Shared uninstall command orchestration (`parse -> intent -> plan -> resolvePlan`).                                              |
| Skill install handler        | `packages/cli/src/cli-commands/skills/install/handler.ts`        | existing          | Reduced to command-specific wiring into `runInstallCommandWorkflow` hooks.                                                      |
| Skill uninstall handler      | `packages/cli/src/cli-commands/skills/uninstall/handler.ts`      | existing          | Reduced to command-specific wiring into `runUninstallCommandWorkflow` hooks.                                                    |
| Pack install handler         | `packages/cli/src/cli-commands/packs/install/handler.ts`         | existing          | Largest simplification target; source resolution/discovery/intent/plan glue moves to `runInstallCommandWorkflow`.               |
| Pack uninstall handler       | `packages/cli/src/cli-commands/packs/uninstall/handler.ts`       | existing          | Moves to `runUninstallCommandWorkflow` + pack-specific uninstall intent hook.                                                   |
| MCP-server install handler   | `packages/cli/src/cli-commands/mcp-servers/install/handler.ts`   | no-op placeholder | Explicitly out of implementation scope; retained as future integration point only.                                              |
| MCP-server uninstall handler | `packages/cli/src/cli-commands/mcp-servers/uninstall/handler.ts` | no-op placeholder | Explicitly out of implementation scope; retained as future integration point only.                                              |

### Operation run effects / lifecycle hooks

| Area                         | Path                                                              | Status               | Impact                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Install operation workflow   | `packages/cli/src/workflows/install-operation/workflow.ts`        | new                  | Defines `buildInstallOperation` and `runInstallOperation` for install operation execution.                               |
| Uninstall operation workflow | `packages/cli/src/workflows/uninstall-operation/workflow.ts`      | new                  | Defines `buildUninstallOperation` and `runUninstallOperation` for uninstall operation execution.                         |
| Extension hook types         | `packages/cli/src/workflows/install-operation/hooks.ts`           | new                  | Defines shared `ExtensionHooks<TRef>` type consumed by extension features.                                               |
| Skill install op             | `packages/cli/src/extensions/skills/operations/install.ts`        | existing             | Called by `skillHooks.materializeInstall`; command/workflow orchestration concerns moved out of operation `run` effects. |
| Skill uninstall op           | `packages/cli/src/extensions/skills/operations/uninstall.ts`      | existing             | Called by `skillHooks.materializeUninstall`; dependency-retain decision stays in uninstall workflow.                     |
| MCP-server install op        | `packages/cli/src/extensions/mcp-servers/operations/install.ts`   | no-op in this change | Existing operation remains unchanged; not migrated to shared operation workflows yet.                                    |
| MCP-server uninstall op      | `packages/cli/src/extensions/mcp-servers/operations/uninstall.ts` | no-op in this change | Existing operation remains unchanged; not migrated to shared operation workflows yet.                                    |
| Pack install op              | `packages/cli/src/extensions/packs/operations/install.ts`         | existing             | Becomes pack materialization + pack intent expansion only; no direct cross-type state writes.                            |
| Pack uninstall op            | `packages/cli/src/extensions/packs/operations/uninstall.ts`       | existing             | Becomes pack cleanup only; dependency-preservation policy is enforced in uninstall operation workflow.                   |
| Skill hooks                  | `packages/cli/src/extensions/skills/hooks.ts`                     | new                  | Encapsulates `PackagingKind` materialization plus skill settings/lockfile mutation methods.                              |
| MCP-server hooks             | `packages/cli/src/extensions/mcp-servers/hooks.ts`                | no-op placeholder    | Not implemented in this change; reserved for future `mcp-server` support.                                                |
| Pack hooks                   | `packages/cli/src/extensions/packs/hooks.ts`                      | new                  | Encapsulates pack materialization plus pack settings/lockfile mutation methods for supported types.                      |

## Simplification Analysis

This change intentionally shifts complexity from command handlers and per-extension operations into two stable seams:

- command-family workflows (install, uninstall)
- shared operation workflows (canonical install/uninstall operation execution via `resolvePlan`/`applyPlan`)

Expected simplification outcomes:

1. **Pack handlers become dramatically smaller**
   - Current pack handlers perform many concerns together (source parsing, registry probing/fallback, discovery, dependency expansion, plan assembly, lifecycle decisions, and status logging).
   - After refactor, handlers mainly bind command-specific hooks to install/uninstall family workflows.
   - Pack-specific complexity moves to one focused pack hook + intent layer.

2. **Single source of truth for workspace-state updates**
   - `SettingsDocument` / `LockfileDocument` add/remove logic is no longer repeated in migrated `skill`/`pack` operation `run` effects.
   - This eliminates the prior bug class where one `ExtensionType` path forgot a lockfile/settings update.

3. **Reduced cognitive load per file**
   - Handler files should read as orchestration declarations.
   - Extension operation files should stay materialization-focused; shared operation workflows own sequencing/policy.
   - Intent expansion (especially packs) is isolated and testable independently.

4. **SRP-aligned reuse**
   - Reuse happens at command-family level (install vs uninstall), not across unrelated command families.
   - Shared primitives stay reusable without forcing enable/disable/fork into install-shaped abstractions.

5. **Execution simplicity at operation layer**
   - Operation execution treats operation args as trusted, plan-validated intent.
   - No duplicate validation paths exist across operation `run` effects.
   - Operation execution focuses purely on snapshot -> internal steps -> operation result.

## Migration Plan

1. Evolve `PlannedJobStep` to `ReadyJobStep | ErrorJobStep` with `run` closures. Simplify `resolvePlan`/`applyPlan` to execute `run` effects directly (remove handler-map dispatch, `Operation`/`OperationMap`, `defineOperationMetadata`, and `augmentPlan`).
2. Add shared operation workflows (`buildInstallOperation`, `buildUninstallOperation`) and `ExtensionHooks` type.
3. Add shared command primitives (parse/source/discovery/intent/plan helpers).
4. Implement `runInstallCommandWorkflow` and migrate `skill`/`pack` install handlers.
5. Implement `runUninstallCommandWorkflow` and migrate `skill`/`pack` uninstall handlers.
6. Keep legacy `pack` command/mcp dependency execution paths until those extension types are migrated.
7. Remove duplicated lockfile/settings writes and duplicated source/discovery orchestration from command handlers and operation `run` effects.

## Risks / Trade-offs

- **Hook boundary leaks**: keep sequencing/policy in shared operation workflows while hooks stay primitive/type-specific; enforce via tests.
- **Pack complexity**: cross-type expansion can produce repeated targets; rely on idempotent operation semantics in this change (no dedupe layer added).
- **Behavior drift during migration**: use contract tests to enforce parity across extension types.
- **Future no-op confusion**: keep `mcp-server`/`command` integration explicitly labeled as no-op until supported.

## Test Strategy

- Shared contract tests (all operation hook sets):
  - install writes lockfile parity
  - uninstall removes lockfile parity
  - preserve dependency-required installations on uninstall (validated in operation execution)
  - idempotent rerun produces no-op / safe re-application
  - preview does not apply and does not invoke any operation `run` effect
  - repeated expanded targets remain safe via idempotent operation semantics
- Type-specific tests:
  - skill native vs non-native branches
  - pack cross-type dependency expansion/preservation (supported types only)
  - `mcp-server`/`command` no-op extension points remain inert

- Command workflow tests:
  - `runInstallCommandWorkflow` phase order across `skill`/`pack` install handlers
  - `runUninstallCommandWorkflow` phase order across `skill`/`pack` uninstall handlers
  - host probe diagnostics are consistent across supported install workflows
  - migration-scoped CLI changes are covered and documented (`skills --list` removal, skills `--agent` removal)

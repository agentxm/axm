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

This design adds a `namespace` field to `PackExtensionRefBase` in `sources/types.ts` so that all pack refs expose a canonical namespace (required for `PackExtensionTarget` construction). All other workflow logic derives operation targets from existing `ExtensionRef` fields (`type`, `refType`, source-specific name fields).

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
- Isolate type-specific behavior in per-type services.
- Support pack cross-type orchestration without hard-coding dependency side effects in pack handlers.
- Preserve deterministic preview/apply behavior and idempotency.

**Non-Goals**

- Reworking publish/update/fork flows.
- Replacing plan/job semantics or user-visible preview/apply behavior.
- Introducing inheritance-heavy domain class hierarchy as the core abstraction.

## CLI Behavior Notes

- `skills install --list` is removed in this migration; discovery-only inspection should use `--preview`.
- `skills install --agent` and `skills uninstall --agent` are removed in this migration; operations are workspace-scoped. Skill materialization creates agent symlinks for all agents returned by `ws.getConfiguredAgents()` (the workspace's configured agent list from settings).
- `--force` is repurposed: it no longer controls skip-if-installed (operations are always applied idempotently; the `skip` readiness state is removed). Instead, `--force` causes `applyPlan` to proceed when planned steps have `readiness === "warn"` without prompting the user for confirmation.
- Pack migration in this change includes dependency installation/uninstallation for `skill`, `command`, and `mcp-server` dependencies.
- Existing legacy `command` / `mcp-server` pack lifecycle paths are removed after migration parity is validated.

## Architecture

### 1) Shared Lifecycle Core (common)

The lifecycle core is not a separate kernel file; it is the evolved `resolvePlan`/`applyPlan` pipeline plus the shared operation workflows (`buildInstallOperation`, `buildUninstallOperation`).

Command-family flow (composed by command-family workflows):

1. `parseArgs`
2. install-only: `resolveSourceRequests` -> `discoverRefs`
3. `finalizeIntent`
4. plan building (`buildPlan` / `buildUninstallPlan`) producing `PlannedJobStep` steps with `run` closures
5. `resolvePlan` -> preview/confirm -> `applyPlan` (executes step `run` effects directly)

`resolvePlan`/`applyPlan` responsibilities:

- display plan for preview/confirmation
- block apply when any planned step has `readiness === "error"` (error means the planned step has a known problem that prevents execution; the entire plan is rejected)
- prompt user for confirmation when any planned step has `readiness === "warn"` (unless `--force` is passed, which auto-accepts warned steps)
- execute `run` effects for ready and accepted-warn steps in job order
- promote error steps to error results without execution
- return `ExecutedPlan` with `CompletedJobStep` per step
- `resolvePlan` returns `Effect<ExecutedPlan, PromptCancelled | CliError>` since it may prompt the user for confirmation (preserving current behavior)
- `resolvePlan` retains its existing UI service requirements (`Log`, `Confirm`, or equivalent) for plan display and confirmation, even though step `run` effects are `R = never`
- when warn confirmation is declined, `resolvePlan` fails with `PromptCancelled` and `applyPlan` is not executed
- when apply is blocked by readiness errors, `resolvePlan` fails with `CliError` (code: `PLAN_BLOCKED_BY_ERRORS`) containing the error diagnostics from blocked steps

Inter-job blocking semantics (preserved from current behavior):

- if any step in job N produces an error result (runtime failure), subsequent jobs (N+1, N+2, ...) are blocked and their steps are promoted to error results
- steps within the same job continue executing (no early abort within a job)

Warn-step creation policy:

- plan builders may emit `readiness === "warn"` for non-blocking risk conditions that need explicit user acknowledgement
- this change defines warn handling semantics but does not introduce new warn-producing rules for migrated `skill` / `pack` paths
- illustrative future warn condition: installing from an untrusted source host may produce a warn step that requires confirmation (or `--force`)

Step dependency model:

- `PlannedJobStep.run` must be `Effect.Effect<JobStepResult, CliError, never>`
- all step dependencies are resolved before plan construction and captured in closures
- `applyPlan` performs no per-step service lookup beyond invoking `step.run()`

### 1b) Command-Family Workflows (SRP)

Workflow types and orchestration live in `packages/cli/src/workflows/`. This is a new top-level directory justified because workflows are orchestration primitives that sit between commands (`cli-commands/`) and extension managers (`extensions/`), consumed by multiple command families. Sub-directories: `install-command/`, `uninstall-command/`, `install-operation/`, `uninstall-operation/`.

Define one workflow per command family and compose each from shared command primitives.

Examples:

- `runInstallCommandWorkflow` (shared by supported install handlers in this change)
- `runUninstallCommandWorkflow` (shared by supported uninstall handlers in this change)

Each family workflow may use different phases while reusing common primitives (`parse`, `resolveSource`, `discover`, `finalizeIntent`, `resolvePlan`).

Rationale:

- Preserve SRP at command-family level.
- Avoid a single cross-family workflow with many optional/no-op methods.
- Keep command-specific UX explicit; input validation/normalization happens before operation execution.

Critical rule:

- Operation managers expose type-specific settings/lockfile mutation methods.
- Shared operation workflows (`runInstallOperation` / `runUninstallOperation`) own sequencing/policy and call manager methods in canonical order.
- `resolvePlan` / `applyPlan` execute per-step `run` effects for ready and accepted-warn steps directly (no handler registry maps).
- `resolvePlan` must block apply when any planned step has `readiness === "error"` (an error readiness indicates a known problem with the planned step, not a runtime failure — the entire plan is not applied).
- `resolvePlan` must prompt before apply when any planned step has `readiness === "warn"` (unless `--force` is passed).

### 1c) `resolvePlan` / `applyPlan` Evolution

The existing `resolvePlan(plan, handlerMap)` signature evolves to `resolvePlan(plan)` (no handler map). Steps carry their own `run` effect closures; `applyPlan` executes them directly instead of dispatching through a name-keyed handler registry.

Changes:

- `PlannedJobStep` gains a `run` closure (for ready and warn steps) and loses its `operation` payload.
- `applyPlan` iterates steps: for each ready/warn step, invokes `step.run()`; for each error step, promotes to an error result.
- The existing `Operation`, `OperationMap`, and `defineOperationMetadata` registries are removed.
- Plan augmentation (`augmentPlan`) is removed in this change. Lockfile recovery behavior is out of scope and can be reintroduced as a pre-plan check if needed later. **Known regression:** uninstall workflows depend on lockfile reads during `finalizeIntent` / `buildUninstallPlan` to resolve targets. If the lockfile is missing or corrupt, these phases will fail. A lightweight lockfile-state precondition check should be introduced as follow-up work.

### 2) Operation Manager Contract (type-specific lifecycle)

Introduce per-`ExtensionType` lifecycle managers implementing `ExtensionManager<TRef>`:

- materialization methods
- type-specific settings/lockfile mutation methods

These manager methods are reusable extension-type primitives (skill/pack aligned), not per-operation workflows. Cross-cutting uninstall policy (dependency-retention checks/updates) is owned by the shared uninstall operation workflow, not by individual managers.

Managers are Effect services (`SkillManager`, `PackManager`, `CommandManager`, `McpServerManager`). Their dependency requirements are inferred from each service construction signature, and planned step `run` effects capture manager methods so runtime execution remains `R = never`.

Command-family workflows own parse/resolve/discover phases. Lifecycle managers do not parse CLI input and do not perform source-host discovery.

Managers to implement in scope:

- `SkillManager`
- `PackManager`
- `CommandManager`
- `McpServerManager`

Command and MCP-server integrations are in scope for full migration in this change.

Add shared command primitives (separate from lifecycle operation managers):

- `parse*`
- `resolveSource*`
- `discover*`
- `finalize*Intent`

Install-family requires a `buildPlan` method.

- Simple install handlers (for example `skills install`) should provide a tiny inline builder.
- Complex install handlers (notably packs) can provide an advanced builder.

Uninstall-family keeps an explicit plan path (`buildUninstallPlan`) because uninstall semantics diverge by command.

Command-family workflows compose these primitives through family-specific contracts:

- `InstallExtensionCommandWorkflowActions<...>` for install
- `UninstallExtensionCommandWorkflowActions<...>` for uninstall

### 3) Intent Model

Use command-specific immutable intents (owned by each command folder), not one shared global intent type.

Examples:

- `cli-commands/skills/install/intent.ts` -> `InstallSkillCommandIntent`
- `cli-commands/skills/uninstall/intent.ts` -> `UninstallSkillCommandIntent`
- `cli-commands/packs/install/intent.ts` -> `InstallPackCommandIntent`
- `cli-commands/packs/uninstall/intent.ts` -> `UninstallPackCommandIntent`

Pack install intent identifies the selected pack; dependency expansion happens in `buildPlan` for supported types.

Dependency-preservation policy for uninstall uses two layers:

1. **Plan-level (pre-filter):** Pack uninstall plan builders pre-compute orphans via `expandPackUninstallTargets` — only actually-removable targets appear in the plan (candidates minus remaining-pack-refs minus directly-configured extensions). This keeps plan preview accurate and trustworthy.
2. **Operation-level (safety net):** `runUninstallOperation` receives an `UninstallRetentionPolicy` (captured from workspace service at plan-build time) and retains an `isRequiredByInstalledPack` guard as defense-in-depth. This catches the `skills uninstall` path where a user directly targets a pack-referenced skill (bypassing pack plan expansion).

Uninstall targets must be derived with lockfile-backed context during `finalizeIntent` / `buildUninstallPlan` so dependency checks are deterministic (`pack` targets include namespace; `skill`/`command`/`mcp-server` targets are name-only).

`PackExtensionRefBase` gains a `readonly namespace: string` field in this change. For registry packs, this is populated from `RegistryRefDetails.namespace`. For builtin packs, this is populated from the builtin manifest. This ensures all `PackExtensionRef` variants expose `ref.namespace` for `PackExtensionTarget` construction.

### 3b) Term Glossary

- `ExtensionRef`: discovery output from sources (`type`, `refType`, source-backed fields).
- `*CommandIntent`: command-local decision payload after selection/filtering.
- `ExtensionTarget`: normalized execution target used by uninstall/runtime policy checks.
- Install operations are `ExtensionRef`-driven.
- Uninstall operations are lockfile-backed `ExtensionTarget`-driven.
- `PlannedJobStep`: existing plan type, evolved to `ReadyJobStep | WarnJobStep | ErrorJobStep` (no `operation` payload on steps). The existing `skip` readiness state is removed; operations are assumed idempotent (re-running an already-applied operation is a safe no-op). `warn` readiness is retained for steps that can execute but require user attention (user is prompted unless `--force` is passed). `error` readiness means the planned step has a known problem that prevents execution — the entire plan is blocked from applying (fails with `CliError`).
- `CompletedJobStep`: post-execution step with `label` and `JobStepResult`.
- `ExecutedPlan`: post-execution plan containing `CompletedJobStep` entries. Returned by `resolvePlan`.

### 4) Operation Execution Model

Canonical execution unit is the user-meaningful operation (`install-skill`, `uninstall-pack`, etc.).

- Planning unit: `PlannedJobStep`
- Execution unit: operation `run` effects (`runInstallOperation` / `runUninstallOperation`)
- Internal implementation detail: operation workflow steps (for example materialize, lockfile update, settings update)

`SettingsDocument` and `LockfileDocument` ownership:

- Operation workflows (shared install/uninstall operation abstractions) are the only place that decides sequencing and dependency-retention policy.
- Extension managers provide reusable type-specific materialization/settings/lockfile primitives invoked by those workflows.

### 4b) Output Model (operation-oriented rendering)

Default CLI output renders operation outcomes directly.

- Render unit: operation outcome (`label` + `JobStepResult`)

Render rules:

1. Preserve plan step order for operation outcome rendering.
2. Readiness errors cause `resolvePlan` to fail with `CliError` (plan blocked); error details are in the `CliError`.
3. Render readiness warnings with attention indicator (prompted unless `--force`).
4. Render one `CompletedJobStep` per ready/warn planned job step `run` effect.

This keeps CLI output aligned with user-meaningful operations.

### 5) Target Scope for `mcp-server` and `command`

In this change, `mcp-server` and `command` lifecycle integration is fully migrated to shared workflows and managers.

- `CommandManager` and `McpServerManager` implement `ExtensionManager<TRef>` for their respective extension refs.
- Pack dependency expansion includes supported `command` and `mcp-server` targets in addition to `skill`.
- Legacy operation-handler paths for these types are removed once parity tests pass.

### 6) Skill Native vs Non-Native

Skill manager logic branches by `PackagingKind`:

- `native`: native-specific materialization/reconciliation behavior
- `non-native`: source-backed behavior

Branching is inside manager strategy, not in shared kernel.

Lockfile `agents` field is retained on skill lock entries, reflecting the configured agents at the time of install (the set returned by `ws.getConfiguredAgents()` during `SkillManagerLive` construction).

### 7) Pack Cross-Type Behavior

Pack install/uninstall does not directly call other handlers.

- Pack plan builders expand cross-type execution targets.
- Shared executor applies extension managers for materialization and state updates.

This keeps pack orchestration composable while preserving shared operation execution rules.

## Pseudocode

### `packages/cli/src/workflows/install-command/workflow.ts`

```ts
export interface InstallExtensionCommandWorkflowActions<Args, Parsed, Req, Ref, Intent> {
  readonly parseArgs: (args: Args) => Effect.Effect<Parsed, CliError>;
  readonly resolveSourceRequests: (parsed: Parsed) => Effect.Effect<ReadonlyArray<Req>, CliError>;
  readonly discoverRefs: (reqs: ReadonlyArray<Req>) => Effect.Effect<ReadonlyArray<Ref>, CliError>;
  readonly finalizeIntent: (
    parsed: Parsed,
    refs: ReadonlyArray<Ref>,
  ) => Effect.Effect<Intent, CliError>;
  readonly buildPlan: (intent: Intent) => Effect.Effect<Plan, CliError>;
}

export const runInstallCommandWorkflow = <Args, Parsed, Req, Ref, Intent>(
  args: Args,
  actions: InstallExtensionCommandWorkflowActions<Args, Parsed, Req, Ref, Intent>,
) =>
  Effect.gen(function* () {
    const parsed = yield* actions.parseArgs(args);
    const sourceRequests = yield* actions.resolveSourceRequests(parsed);
    const refs = yield* actions.discoverRefs(sourceRequests);
    const intent = yield* actions.finalizeIntent(parsed, refs);
    const plan = yield* actions.buildPlan(intent);
    const ws = yield* Workspace;
    yield* ws.resolvePlan(plan);
  });
```

### `packages/cli/src/workflows/uninstall-command/workflow.ts`

```ts
export interface UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent> {
  readonly parseArgs: (args: Args) => Effect.Effect<Parsed, CliError>;
  readonly finalizeIntent: (parsed: Parsed) => Effect.Effect<Intent, CliError>;
  readonly buildUninstallPlan: (intent: Intent) => Effect.Effect<Plan, CliError>;
}

export const runUninstallCommandWorkflow = <Args, Parsed, Intent>(
  args: Args,
  actions: UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent>,
) =>
  Effect.gen(function* () {
    const parsed = yield* actions.parseArgs(args);
    const intent = yield* actions.finalizeIntent(parsed);
    const plan = yield* actions.buildUninstallPlan(intent);
    const ws = yield* Workspace;
    yield* ws.resolvePlan(plan);
  });
```

### `packages/cli/src/workflows/install-operation/workflow.ts`

```ts
// -----------------------------------------------------------------------------
// Plan types (evolved from generic Plan<TOperation>; no longer generic)
// -----------------------------------------------------------------------------

// Evolution of existing PlannedJobStep (not a new parallel type).
// The previous `skip` readiness state is removed; operations are idempotent
// so re-running an already-applied operation is a safe no-op.
// `warn` is retained for steps requiring user attention before apply.
// `error` means a known problem — the entire plan is blocked from applying.
type ReadyJobStep = {
  readonly label: string;
  readonly readiness: "ready";
  readonly run: () => Effect.Effect<JobStepResult, CliError, never>;
};

type WarnJobStep = {
  readonly label: string;
  readonly readiness: "warn";
  readonly message: string;
  readonly run: () => Effect.Effect<JobStepResult, CliError, never>;
};

type ErrorJobStep = {
  readonly label: string;
  readonly readiness: "error";
  readonly message: string;
};

type PlannedJobStep = ReadyJobStep | WarnJobStep | ErrorJobStep;

// Replaces the existing OperationResult. Discriminated union for step outcomes.
type JobStepResult =
  | { readonly result: "success"; readonly message: string }
  | { readonly result: "error"; readonly message: string; readonly error: CliError };

// Post-execution step (result of invoking a planned step's `run` effect).
type CompletedJobStep = {
  readonly label: string;
  readonly result: JobStepResult;
};

type Job = {
  readonly steps: ReadonlyArray<PlannedJobStep>;
  readonly concurrency: "unbounded" | 1;
};

type Plan = {
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job>;
};

type ExecutedPlan = {
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<{
    readonly steps: ReadonlyArray<CompletedJobStep>;
    readonly concurrency: "unbounded" | 1;
  }>;
};

// Per-extension-type target types (discriminated union).
// Invariants in this change: pack targets require namespace; skill/command/mcp-server targets are name-only.
type SkillExtensionTarget = {
  readonly type: "skill";
  readonly name: string;
};

type PackExtensionTarget = {
  readonly type: "pack";
  readonly name: string;
  readonly namespace: string;
};

type CommandExtensionTarget = {
  readonly type: "command";
  readonly name: string;
};

type McpServerExtensionTarget = {
  readonly type: "mcp-server";
  readonly name: string;
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
  switch (ref.type) {
    case "skill":
      return { type: "skill", name: ref.skill.name };
    case "pack":
      return { type: "pack", name: ref.pack.name, namespace: ref.namespace };
    case "command":
      return { type: "command", name: ref.command.name };
    case "mcp-server":
      return { type: "mcp-server", name: ref.server.name };
  }
};

const toLabel = (target: ExtensionTarget): string =>
  target.type === "pack" ? `${target.namespace}/${target.name}` : target.name;

type InstallOperationArgs<TRef extends ExtensionRef> = {
  readonly ref: TRef;
  readonly versionConstraint: Option.Option<string>;
};

interface ExtensionManager<TRef extends ExtensionRef> {
  readonly extensionType: TRef["type"];
  readonly materializeInstall: (args: { readonly ref: TRef }) => Effect.Effect<void, CliError>;
  readonly materializeUninstall: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, CliError>;
  readonly upsertSettingsEntry: (args: {
    readonly ref: TRef;
    readonly versionConstraint: Option.Option<string>;
  }) => Effect.Effect<void, CliError, never>;
  readonly removeSettingsEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, CliError, never>;
  readonly upsertLockfileEntry: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, CliError, never>;
  readonly removeLockfileEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, CliError, never>;
}

// Cross-cutting uninstall dependency-retention policy.
// Captured from workspace service at plan-build time and passed to runUninstallOperation.
interface UninstallRetentionPolicy {
  readonly isRequiredByInstalledPack: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, CliError, never>;
  readonly markDependencyRetainedInLockfile: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<void, CliError, never>;
}

// Step `run` methods receive a fully-resolved manager so operation execution
// remains `R = never`.

export const buildInstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: InstallOperationArgs<TRef>,
): PlannedJobStep => {
  const ref = args.ref;
  const target = targetFromRef(ref);

  return {
    label: toLabel(target),
    readiness: "ready",
    run: () => runInstallOperation(manager, args),
  };
};

const runInstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  args: InstallOperationArgs<TRef>,
) =>
  Effect.gen(function* () {
    yield* manager.materializeInstall({ ref: args.ref });
    yield* manager.upsertLockfileEntry({ ref: args.ref });
    yield* manager.upsertSettingsEntry({
      ref: args.ref,
      versionConstraint: args.versionConstraint,
    });
    return {
      result: "success" as const,
      message: "Applied install operation",
    } satisfies JobStepResult;
  });
```

**Failure semantics:** If a step's `run` effect fails (returns a `CliError`), the step is marked as errored in the plan results. Remaining steps in the same job continue executing (no early abort within a job). If any step in a job produces an error result, subsequent jobs are blocked and their steps are promoted to error results. Partial state (e.g. materialized on disk but not locked) is acceptable; idempotent re-runs and lockfile reconciliation handle recovery.

### `packages/cli/src/workflows/uninstall-operation/workflow.ts`

```ts
type UninstallOperationArgs<TRef extends ExtensionRef> = {
  readonly target: ExtensionTargetFor<TRef>;
};

export const buildUninstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy,
  args: UninstallOperationArgs<TRef>,
): PlannedJobStep => {
  const target = args.target;

  return {
    label: toLabel(target),
    readiness: "ready",
    run: () => runUninstallOperation(manager, retentionPolicy, args),
  };
};

const runUninstallOperation = <TRef extends ExtensionRef>(
  manager: ExtensionManager<TRef>,
  retentionPolicy: UninstallRetentionPolicy,
  args: UninstallOperationArgs<TRef>,
) =>
  Effect.gen(function* () {
    const stillRequiredByPack = yield* retentionPolicy.isRequiredByInstalledPack({
      target: args.target,
    });

    if (stillRequiredByPack) {
      yield* manager.removeSettingsEntry({ target: args.target });
      yield* retentionPolicy.markDependencyRetainedInLockfile({ target: args.target });
      return {
        result: "success" as const,
        message: "Kept on disk because dependency is still required by an installed pack",
      } satisfies JobStepResult;
    }

    yield* manager.materializeUninstall({ target: args.target });
    yield* manager.removeLockfileEntry({ target: args.target });
    yield* manager.removeSettingsEntry({ target: args.target });
    return {
      result: "success" as const,
      message: "Applied uninstall operation",
    } satisfies JobStepResult;
  });
```

### `packages/cli/src/cli-commands/skills/install/`

```ts
// command-actions.ts
export class InstallSkillCommandWorkflowActions extends Context.Tag(
  "InstallSkillCommandWorkflowActions",
)<
  InstallSkillCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    SkillsInstallHandlerArgs,
    ParsedSkillInstallArgs,
    SkillSourceRequest,
    SkillExtensionRef,
    InstallSkillCommandIntent
  >
>() {}

export const InstallSkillCommandWorkflowActionsLive = Layer.effect(
  InstallSkillCommandWorkflowActions,
  Effect.succeed({
    parseArgs: parseSkillInstallArgs,
    resolveSourceRequests: resolveSkillInstallSources,
    discoverRefs: discoverSkillRefs,
    finalizeIntent: finalizeSkillInstallIntent,
    buildPlan: buildSkillInstallPlan,
  }),
);

// handler.ts
export const handleSkillsInstall = (args: SkillsInstallHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* InstallSkillCommandWorkflowActions;
    yield* runInstallCommandWorkflow(args, actions);
  });

// intent.ts
export type InstallSkillCommandIntent = {
  readonly skillsToInstall: ReadonlyArray<{
    readonly ref: SkillExtensionRef;
    readonly versionConstraint: Option.Option<string>;
  }>;
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
      skillsToInstall: selected.map((x) => ({
        ref: x.ref,
        versionConstraint: parsed.versionConstraint,
      })),
    } satisfies InstallSkillCommandIntent;
  });

// build-plan.ts
export const buildSkillInstallPlan = (intent: InstallSkillCommandIntent) =>
  Effect.gen(function* () {
    const skillManager = yield* SkillManager;

    return {
      name: "Install skill(s)",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: intent.skillsToInstall.map((entry) =>
            buildInstallOperation(skillManager, {
              ref: entry.ref,
              versionConstraint: entry.versionConstraint,
            }),
          ),
        },
      ],
    } satisfies Plan;
  });
```

### `packages/cli/src/cli-commands/packs/install/`

```ts
// intent.ts
export type InstallPackCommandIntent = {
  readonly packToInstall: PackExtensionRef;
  readonly versionConstraint: Option.Option<string>;
};

// command-actions.ts
export class InstallPackCommandWorkflowActions extends Context.Tag(
  "InstallPackCommandWorkflowActions",
)<
  InstallPackCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    PacksInstallHandlerArgs,
    ParsedPackInstallArgs,
    PackSourceRequest,
    PackExtensionRef,
    InstallPackCommandIntent
  >
>() {}

export const InstallPackCommandWorkflowActionsLive = Layer.effect(
  InstallPackCommandWorkflowActions,
  Effect.succeed({
    parseArgs: parsePackInstallArgs,
    resolveSourceRequests: resolvePackInstallSources,
    discoverRefs: discoverPackRefs,
    finalizeIntent: buildPackInstallIntent,
    buildPlan: buildPackInstallPlan,
  }),
);

// handler.ts
export const handlePacksInstall = (args: PacksInstallHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* InstallPackCommandWorkflowActions;
    yield* runInstallCommandWorkflow(args, actions);
  });

// build-plan.ts
export const buildPackInstallPlan = (
  intent: InstallPackCommandIntent,
): Effect.Effect<Plan, CliError> =>
  Effect.gen(function* () {
    const packManager = yield* PackManager;
    const skillManager = yield* SkillManager;
    const commandManager = yield* CommandManager;
    const mcpServerManager = yield* McpServerManager;

    const refs: ReadonlyArray<ExtensionRef> = yield* expandPackInstallRefs({
      pack: intent.packToInstall,
      supportedDependencyTypes: ["skill", "command", "mcp-server"],
    });

    const steps = refs.map((ref): PlannedJobStep => {
      const target = targetFromRef(ref);

      if (ref.type === "pack") {
        return buildInstallOperation<PackExtensionRef>(packManager, {
          ref,
          versionConstraint: intent.versionConstraint,
        });
      }

      // Dependency extensions are installed without a direct user version constraint.
      if (ref.type === "skill") {
        return buildInstallOperation<SkillExtensionRef>(skillManager, {
          ref,
          versionConstraint: Option.none(),
        });
      }

      if (ref.type === "command") {
        return buildInstallOperation<CommandExtensionRef>(commandManager, {
          ref,
          versionConstraint: Option.none(),
        });
      }

      if (ref.type === "mcp-server") {
        return buildInstallOperation<McpServerExtensionRef>(mcpServerManager, {
          ref,
          versionConstraint: Option.none(),
        });
      }

      return {
        label: toLabel(target),
        readiness: "error",
        message: `Unsupported dependency type: ${ref.type}`,
      };
    });

    return {
      name: "Install pack",
      description: Option.none(),
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

// command-actions.ts
export class UninstallSkillCommandWorkflowActions extends Context.Tag(
  "UninstallSkillCommandWorkflowActions",
)<
  UninstallSkillCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    SkillsUninstallHandlerArgs,
    ParsedSkillUninstallArgs,
    UninstallSkillCommandIntent
  >
>() {}

export const UninstallSkillCommandWorkflowActionsLive = Layer.effect(
  UninstallSkillCommandWorkflowActions,
  Effect.succeed({
    parseArgs: parseSkillUninstallArgs,
    finalizeIntent: finalizeSkillUninstallIntent,
    buildUninstallPlan: buildSkillUninstallPlan,
  }),
);

// handler.ts
export const handleSkillsUninstall = (args: SkillsUninstallHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* UninstallSkillCommandWorkflowActions;
    yield* runUninstallCommandWorkflow(args, actions);
  });

// finalize-intent.ts
export const finalizeSkillUninstallIntent = (parsed: ParsedSkillUninstallArgs) =>
  Effect.succeed({
    skillsToUninstall: parsed.skills.map((skillName) => ({ skillName })),
  } satisfies UninstallSkillCommandIntent);

// build-uninstall-plan.ts
export const buildSkillUninstallPlan = (intent: UninstallSkillCommandIntent) =>
  Effect.gen(function* () {
    const skillManager = yield* SkillManager;
    const ws = yield* Workspace;
    const retentionPolicy: UninstallRetentionPolicy = {
      isRequiredByInstalledPack: (args) => ws.isExtensionRequiredByInstalledPack(args.target),
      markDependencyRetainedInLockfile: (args) => ws.markDependencyRetainedInLockfile(args.target),
    };
    const targets = yield* resolveSkillUninstallTargetsFromLockfile(intent.skillsToUninstall);

    return {
      name: "Uninstall skill(s)",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: targets.map((target) =>
            buildUninstallOperation(skillManager, retentionPolicy, { target }),
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

// command-actions.ts
export class UninstallPackCommandWorkflowActions extends Context.Tag(
  "UninstallPackCommandWorkflowActions",
)<
  UninstallPackCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    PacksUninstallHandlerArgs,
    ParsedPackUninstallArgs,
    UninstallPackCommandIntent
  >
>() {}

export const UninstallPackCommandWorkflowActionsLive = Layer.effect(
  UninstallPackCommandWorkflowActions,
  Effect.succeed({
    parseArgs: parsePackUninstallArgs,
    finalizeIntent: finalizePackUninstallIntent,
    buildUninstallPlan: buildPackUninstallPlan,
  }),
);

// handler.ts
export const handlePacksUninstall = (args: PacksUninstallHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* UninstallPackCommandWorkflowActions;
    yield* runUninstallCommandWorkflow(args, actions);
  });

// finalize-intent.ts
export const finalizePackUninstallIntent = (parsed: ParsedPackUninstallArgs) =>
  Effect.succeed({
    packToUninstall: parsed.pack,
  } satisfies UninstallPackCommandIntent);

// build-uninstall-plan.ts
export const buildPackUninstallPlan = (
  intent: UninstallPackCommandIntent,
): Effect.Effect<Plan, CliError> =>
  Effect.gen(function* () {
    const packManager = yield* PackManager;
    const skillManager = yield* SkillManager;
    const commandManager = yield* CommandManager;
    const mcpServerManager = yield* McpServerManager;
    const ws = yield* Workspace;
    const retentionPolicy: UninstallRetentionPolicy = {
      isRequiredByInstalledPack: (args) => ws.isExtensionRequiredByInstalledPack(args.target),
      markDependencyRetainedInLockfile: (args) => ws.markDependencyRetainedInLockfile(args.target),
    };

    // Pre-filters orphans: returns only targets that are actually removable.
    // Computes: pack dependency candidates - remaining pack refs - directly configured extensions.
    // Plan preview shows only what will be removed; no runtime no-ops for retained dependencies.
    const targets = yield* expandPackUninstallTargets({
      pack: intent.packToUninstall,
      supportedDependencyTypes: ["skill", "command", "mcp-server"],
    });

    return {
      name: "Uninstall pack",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: targets.map((target): PlannedJobStep => {
            if (target.type === "pack") {
              return buildUninstallOperation<PackExtensionRef>(packManager, retentionPolicy, {
                target,
              });
            }

            if (target.type === "skill") {
              return buildUninstallOperation<SkillExtensionRef>(skillManager, retentionPolicy, {
                target,
              });
            }

            if (target.type === "command") {
              return buildUninstallOperation<CommandExtensionRef>(commandManager, retentionPolicy, {
                target,
              });
            }

            if (target.type === "mcp-server") {
              return buildUninstallOperation<McpServerExtensionRef>(
                mcpServerManager,
                retentionPolicy,
                { target },
              );
            }

            return {
              label: toLabel(target),
              readiness: "error",
              message: `Unsupported dependency type: ${target.type}`,
            };
          }),
        },
      ],
    } satisfies Plan;
  });
```

### `packages/cli/src/extensions/skills/manager.ts`

```ts
export class SkillManager extends Context.Tag("SkillManager")<
  SkillManager,
  ExtensionManager<SkillExtensionRef>
>() {}

export const SkillManagerLive = Layer.effect(
  SkillManager,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const agents = yield* ws.getConfiguredAgents();

    return {
      extensionType: "skill",

      // Materialization: dispatch by PackagingKind, create agent symlinks for
      // all workspace-configured agents captured during service construction.
      materializeInstall: ({ ref }) =>
        Effect.gen(function* () {
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

      // Settings/lockfile methods delegate to WorkspaceContextService while
      // keeping method signatures dependency-free (R = never).
      // Implementation note: sourceToLockEntry is a pure function; both methods
      // compute the same lock entry for a given ref. Extract into a shared
      // per-ref helper to compute once if needed for performance.
      upsertSettingsEntry: ({ ref, versionConstraint }) => {
        const lockEntry = buildSkillLockEntry(ref, agents);
        return ws.setSkill({ name: ref.skill.name, lockEntry, versionConstraint });
      },

      removeSettingsEntry: ({ target }) => ws.removeSkillSetting(target.name),

      upsertLockfileEntry: ({ ref }) => {
        const lockEntry = buildSkillLockEntry(ref, agents);
        return ws.setSkillLock({
          name: ref.skill.name,
          lockEntry,
          versionConstraint: Option.none(),
        });
      },

      removeLockfileEntry: ({ target }) => ws.removeSkillLock(target.name),
    } satisfies ExtensionManager<SkillExtensionRef>;
  }),
);
```

### `packages/cli/src/extensions/packs/manager.ts`

```ts
export class PackManager extends Context.Tag("PackManager")<
  PackManager,
  ExtensionManager<PackExtensionRef>
>() {}

export const PackManagerLive = Layer.effect(
  PackManager,
  Effect.succeed({
    extensionType: "pack",
    materializeInstall: ({ ref }) => installPack(ref),
    materializeUninstall: ({ target }) => uninstallPack(target.name),
    upsertSettingsEntry: ({ ref, versionConstraint }) => upsertPackSettings(ref, versionConstraint),
    removeSettingsEntry: ({ target }) => removePackSettings(target.name),
    upsertLockfileEntry: ({ ref }) => upsertPackLockfile(ref),
    removeLockfileEntry: ({ target }) => removePackLockfile(target.name),
  } satisfies ExtensionManager<PackExtensionRef>),
);
```

### `packages/cli/src/extensions/commands/manager.ts`

```ts
export class CommandManager extends Context.Tag("CommandManager")<
  CommandManager,
  ExtensionManager<CommandExtensionRef>
>() {}

export const CommandManagerLive = Layer.effect(
  CommandManager,
  Effect.succeed({
    extensionType: "command",
    materializeInstall: ({ ref }) => installCommand(ref),
    materializeUninstall: ({ target }) => uninstallCommand(target.name),
    upsertSettingsEntry: ({ ref, versionConstraint }) =>
      upsertCommandSettings(ref, versionConstraint),
    removeSettingsEntry: ({ target }) => removeCommandSettings(target.name),
    upsertLockfileEntry: ({ ref }) => upsertCommandLockfile(ref),
    removeLockfileEntry: ({ target }) => removeCommandLockfile(target.name),
  } satisfies ExtensionManager<CommandExtensionRef>),
);
```

### `packages/cli/src/extensions/mcp-servers/manager.ts`

```ts
export class McpServerManager extends Context.Tag("McpServerManager")<
  McpServerManager,
  ExtensionManager<McpServerExtensionRef>
>() {}

export const McpServerManagerLive = Layer.effect(
  McpServerManager,
  Effect.succeed({
    extensionType: "mcp-server",
    materializeInstall: ({ ref }) => installMcpServer(ref),
    materializeUninstall: ({ target }) => uninstallMcpServer(target.name),
    upsertSettingsEntry: ({ ref, versionConstraint }) =>
      upsertMcpServerSettings(ref, versionConstraint),
    removeSettingsEntry: ({ target }) => removeMcpServerSettings(target.name),
    upsertLockfileEntry: ({ ref }) => upsertMcpServerLockfile(ref),
    removeLockfileEntry: ({ target }) => removeMcpServerLockfile(target.name),
  } satisfies ExtensionManager<McpServerExtensionRef>),
);
```

### Pack expansion and target resolution helpers

```ts
// Expands a pack ref into its cross-type dependency refs (pack itself + supported dependency types).
// Returns the pack ref first, followed by dependency refs in declaration order.
const expandPackInstallRefs: (args: {
  readonly pack: PackExtensionRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
}) => Effect.Effect<ReadonlyArray<ExtensionRef>, CliError>;

// Computes removable targets for pack uninstall:
//   pack dependency candidates − remaining-pack-refs − directly-configured extensions.
// Returns the pack target first, followed by orphaned dependency targets.
const expandPackUninstallTargets: (args: {
  readonly pack: PackExtensionTarget;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
}) => Effect.Effect<ReadonlyArray<ExtensionTarget>, CliError>;

// Resolves skill names to lockfile-backed uninstall targets.
// Fails with CliError if any skill name is not found in the lockfile.
const resolveSkillUninstallTargetsFromLockfile: (
  skills: ReadonlyArray<{ readonly skillName: string }>,
) => Effect.Effect<ReadonlyArray<SkillExtensionTarget>, CliError>;
```

Command and mcp-server install/uninstall command-actions services follow the same structural pattern as skill install/uninstall. Pseudocode is omitted for brevity; implementations mirror the skill patterns with type-appropriate parsing, discovery, and intent types.

## Effect and Immutability Constraints

- Planning remains immutable (`ReadonlyArray`, no push/mutation); manager construction may be effectful dependency resolution.
- Execution is `Effect`-based (`Effect.forEach`, deterministic concurrency where required).
- Use `Option`/Effect collection APIs; avoid mutable accumulators.

## Handler Impact Inventory

### Command handlers and command-family workflows

| Area                                         | Path                                                                     | Status   | Impact                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Install command workflow                     | `packages/cli/src/workflows/install-command/workflow.ts`                 | new      | Shared install command orchestration (`parse -> resolveSource -> discover -> finalizeIntent -> buildPlan -> resolvePlan`). |
| Uninstall command workflow                   | `packages/cli/src/workflows/uninstall-command/workflow.ts`               | new      | Shared uninstall command orchestration (`parse -> intent -> plan -> resolvePlan`).                                         |
| Skill install handler                        | `packages/cli/src/cli-commands/skills/install/handler.ts`                | existing | Reduced to resolving `InstallSkillCommandWorkflowActions` and invoking `runInstallCommandWorkflow`.                        |
| Skill uninstall handler                      | `packages/cli/src/cli-commands/skills/uninstall/handler.ts`              | existing | Reduced to resolving `UninstallSkillCommandWorkflowActions` and invoking `runUninstallCommandWorkflow`.                    |
| Pack install handler                         | `packages/cli/src/cli-commands/packs/install/handler.ts`                 | existing | Largest simplification target; source resolution/discovery/intent/plan glue moves to `runInstallCommandWorkflow`.          |
| Pack uninstall handler                       | `packages/cli/src/cli-commands/packs/uninstall/handler.ts`               | existing | Moves to `runUninstallCommandWorkflow` + `UninstallPackCommandWorkflowActions` service.                                    |
| Command install handler                      | `packages/cli/src/cli-commands/commands/install/handler.ts`              | existing | Migrated to `runInstallCommandWorkflow` + `InstallCommandCommandWorkflowActions` service.                                  |
| Command uninstall handler                    | `packages/cli/src/cli-commands/commands/uninstall/handler.ts`            | existing | Migrated to `runUninstallCommandWorkflow` + `UninstallCommandCommandWorkflowActions` service.                              |
| Skill install command actions service        | `packages/cli/src/cli-commands/skills/install/command-actions.ts`        | new      | Implements `InstallExtensionCommandWorkflowActions` for skill install parse/source/discovery/intent/plan behavior.         |
| Pack install command actions service         | `packages/cli/src/cli-commands/packs/install/command-actions.ts`         | new      | Implements `InstallExtensionCommandWorkflowActions` for pack install parse/source/discovery/intent/plan behavior.          |
| Skill uninstall command actions service      | `packages/cli/src/cli-commands/skills/uninstall/command-actions.ts`      | new      | Implements `UninstallExtensionCommandWorkflowActions` for skill uninstall parse/intent/plan behavior.                      |
| Pack uninstall command actions service       | `packages/cli/src/cli-commands/packs/uninstall/command-actions.ts`       | new      | Implements `UninstallExtensionCommandWorkflowActions` for pack uninstall parse/intent/plan behavior.                       |
| Command install command actions service      | `packages/cli/src/cli-commands/commands/install/command-actions.ts`      | new      | Implements `InstallExtensionCommandWorkflowActions` for command install parse/source/discovery/intent/plan behavior.       |
| Command uninstall command actions service    | `packages/cli/src/cli-commands/commands/uninstall/command-actions.ts`    | new      | Implements `UninstallExtensionCommandWorkflowActions` for command uninstall parse/intent/plan behavior.                    |
| MCP-server install handler                   | `packages/cli/src/cli-commands/mcp-servers/install/handler.ts`           | existing | Migrated to `runInstallCommandWorkflow` + `InstallMcpServerCommandWorkflowActions` service.                                |
| MCP-server uninstall handler                 | `packages/cli/src/cli-commands/mcp-servers/uninstall/handler.ts`         | existing | Migrated to `runUninstallCommandWorkflow` + `UninstallMcpServerCommandWorkflowActions` service.                            |
| MCP-server install command actions service   | `packages/cli/src/cli-commands/mcp-servers/install/command-actions.ts`   | new      | Implements `InstallExtensionCommandWorkflowActions` for mcp-server install parse/source/discovery/intent/plan behavior.    |
| MCP-server uninstall command actions service | `packages/cli/src/cli-commands/mcp-servers/uninstall/command-actions.ts` | new      | Implements `UninstallExtensionCommandWorkflowActions` for mcp-server uninstall parse/intent/plan behavior.                 |

### Operation run effects / lifecycle managers

| Area                         | Path                                                              | Status   | Impact                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Install operation workflow   | `packages/cli/src/workflows/install-operation/workflow.ts`        | new      | Defines `buildInstallOperation` and `runInstallOperation` for install operation execution.                                   |
| Uninstall operation workflow | `packages/cli/src/workflows/uninstall-operation/workflow.ts`      | new      | Defines `buildUninstallOperation` and `runUninstallOperation` for uninstall operation execution.                             |
| Extension manager interface  | `packages/cli/src/workflows/install-operation/workflow.ts`        | new      | Defines shared `ExtensionManager<TRef>` interface consumed by extension features.                                            |
| Skill install op             | `packages/cli/src/extensions/skills/operations/install.ts`        | existing | Called by `SkillManager` `materializeInstall`; command/workflow orchestration concerns moved out of operation `run` effects. |
| Skill uninstall op           | `packages/cli/src/extensions/skills/operations/uninstall.ts`      | existing | Called by `SkillManager` `materializeUninstall`; dependency-retain decision stays in uninstall workflow.                     |
| Command install op           | `packages/cli/src/extensions/commands/operations/install.ts`      | existing | Called by `CommandManager` `materializeInstall`; orchestration moved to shared operation workflows.                          |
| Command uninstall op         | `packages/cli/src/extensions/commands/operations/uninstall.ts`    | existing | Called by `CommandManager` `materializeUninstall`; retention/safety policy lives in uninstall workflow.                      |
| MCP-server install op        | `packages/cli/src/extensions/mcp-servers/operations/install.ts`   | existing | Called by `McpServerManager` `materializeInstall`; orchestration moved to shared operation workflows.                        |
| MCP-server uninstall op      | `packages/cli/src/extensions/mcp-servers/operations/uninstall.ts` | existing | Called by `McpServerManager` `materializeUninstall`; retention/safety policy lives in uninstall workflow.                    |
| Pack install op              | `packages/cli/src/extensions/packs/operations/install.ts`         | existing | Becomes pack materialization + pack intent expansion only; no direct cross-type state writes.                                |
| Pack uninstall op            | `packages/cli/src/extensions/packs/operations/uninstall.ts`       | existing | Becomes pack cleanup only; dependency-preservation policy is enforced in uninstall operation workflow.                       |
| Skill manager service        | `packages/cli/src/extensions/skills/manager.ts`                   | new      | Encapsulates `PackagingKind` materialization plus skill settings/lockfile mutation methods.                                  |
| Command manager service      | `packages/cli/src/extensions/commands/manager.ts`                 | new      | Encapsulates command materialization plus command settings/lockfile mutation methods.                                        |
| MCP-server manager service   | `packages/cli/src/extensions/mcp-servers/manager.ts`              | new      | Encapsulates mcp-server materialization plus mcp-server settings/lockfile mutation methods.                                  |
| Pack manager service         | `packages/cli/src/extensions/packs/manager.ts`                    | new      | Encapsulates pack materialization plus pack settings/lockfile mutation methods for supported types.                          |

### Workspace service evolution

| Area                                 | Path                                    | Status   | Impact                                                                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolvePlan` signature              | `packages/cli/src/workspace/service.ts` | existing | Evolves from `resolvePlan(plan, handlers)` to `resolvePlan(plan)`: returns `Effect<ExecutedPlan, CliError \| PromptCancelled>`. Steps carry `run` closures directly. Fails with `CliError` when plan has error-readiness steps. |
| `removeSkillSetting`                 | `packages/cli/src/workspace/service.ts` | new      | Removes only settings entry for a skill target (used by `removeSettingsEntry`).                                                                                                                                                 |
| `removeSkillLock`                    | `packages/cli/src/workspace/service.ts` | new      | Removes only lockfile entry for a skill target (used by `removeLockfileEntry`).                                                                                                                                                 |
| `isExtensionRequiredByInstalledPack` | `packages/cli/src/workspace/service.ts` | new      | Returns whether a given `ExtensionTarget` is referenced by any installed pack's dependency list.                                                                                                                                |
| `markDependencyRetainedInLockfile`   | `packages/cli/src/workspace/service.ts` | new      | Updates lockfile entry for an `ExtensionTarget` to indicate it is retained as a pack dependency (not user-configured).                                                                                                          |

## Simplification Analysis

This change intentionally shifts complexity from command handlers and per-extension operations into two stable seams:

- command-family workflows (install, uninstall)
- shared operation workflows (canonical install/uninstall operation execution via `resolvePlan`/`applyPlan`)

Expected simplification outcomes:

1. **Pack handlers become dramatically smaller**
   - Current pack handlers perform many concerns together (source parsing, registry probing/fallback, discovery, dependency expansion, plan assembly, lifecycle decisions, and status logging).
   - After refactor, handlers mainly bind command-specific wiring to install/uninstall family workflows.
   - Pack-specific complexity moves to one focused pack manager + intent layer.

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

1. Evolve `PlannedJobStep` to `ReadyJobStep | WarnJobStep | ErrorJobStep` with `run` closures. Simplify `resolvePlan`/`applyPlan` to execute `run` effects directly (remove handler-map dispatch, `Operation`/`OperationMap`, `defineOperationMetadata`, and `augmentPlan`).
2. Add shared operation workflows (`buildInstallOperation`, `buildUninstallOperation`) and `ExtensionManager<TRef>` + manager services (`SkillManager`, `PackManager`, `CommandManager`, `McpServerManager`) with `run` effects at `R = never`.
3. Add command-family contracts (`InstallExtensionCommandWorkflowActions`, `UninstallExtensionCommandWorkflowActions`) plus shared command primitives (parse/source/discovery/intent/plan helpers).
4. Implement command actions services (`InstallSkillCommandWorkflowActions`, `InstallPackCommandWorkflowActions`, `InstallCommandCommandWorkflowActions`, `InstallMcpServerCommandWorkflowActions`, `UninstallSkillCommandWorkflowActions`, `UninstallPackCommandWorkflowActions`, `UninstallCommandCommandWorkflowActions`, `UninstallMcpServerCommandWorkflowActions`).
5. Implement `runInstallCommandWorkflow` / `runUninstallCommandWorkflow` and migrate `skill`/`pack`/`command`/`mcp-server` handlers to resolve those services.
6. Migrate `command` and `mcp-server` install/uninstall manager services to shared workflows/contracts.
7. Remove duplicated lockfile/settings writes and duplicated source/discovery orchestration from command handlers and operation `run` effects.
8. Remove legacy `command` / `mcp-server` operation-handler paths after parity tests pass.

## Risks / Trade-offs

- **Manager boundary leaks**: keep sequencing/policy in shared operation workflows while managers stay primitive/type-specific; enforce via tests.
- **Pack complexity**: cross-type expansion can produce repeated targets; rely on idempotent operation semantics in this change (no dedupe layer added).
- **Behavior drift during migration**: use contract tests to enforce parity across extension types.
- **Migration breadth**: migrating `skill` + `pack` + `command` + `mcp-server` in one change increases integration risk; mitigate with staged contract and e2e parity tests.

## Test Strategy

- Shared contract tests (all operation manager implementations):
  - install writes lockfile parity
  - uninstall removes lockfile parity
  - preserve dependency-required installations on uninstall (validated in operation execution)
  - idempotent rerun produces safe re-application (success result)
  - preview does not apply and does not invoke any operation `run` effect
  - repeated expanded targets remain safe via idempotent operation semantics
  - `warn` readiness behavior: prompts before apply; `--force` bypasses prompt
  - warn confirmation decline returns `PromptCancelled` and does not execute `applyPlan`
  - `error` readiness causes `resolvePlan` to fail with `CliError` (code: `PLAN_BLOCKED_BY_ERRORS`)
  - inter-job blocking: step error in job N blocks all subsequent jobs
- Type-specific tests:
  - skill native vs non-native branches
  - pack cross-type dependency expansion/preservation (`skill`, `command`, `mcp-server`)
  - pack uninstall pre-filter parity: previewed removable targets match applied targets
  - command manager and mcp-server manager satisfy shared install/uninstall operation manager contracts

- Command workflow tests:
  - `runInstallCommandWorkflow` phase order across `skill`/`pack`/`command`/`mcp-server` install handlers
  - `runUninstallCommandWorkflow` phase order across `skill`/`pack`/`command`/`mcp-server` uninstall handlers
  - migration-scoped CLI changes are covered and documented (`skills --list` removal, skills `--agent` removal)
  - command actions services (`*CommandWorkflowActionsLive`) satisfy install/uninstall workflow contracts
  - command/mcp-server handlers are migrated to workflow-actions services with parity to legacy behavior

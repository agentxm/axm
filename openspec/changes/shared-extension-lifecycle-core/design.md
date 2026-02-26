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

The ontology model already gives stable concepts for this refactor:

- `ExtensionType` (`skill`, `pack`)
- `SourceType` and `RefType`
- `ExtensionRef` (discovery projection)
- `PackagingKind` (`native`, `non-native`)
- workspace entities (`SettingsDocument`, `LockfileDocument`)

## Goals / Non-Goals

**Goals**

- Centralize install/uninstall state update semantics for settings + lockfile.
- Keep command handlers and plan/job orchestration intact.
- Isolate type-specific behavior in per-type hooks.
- Support pack cross-type orchestration without hard-coding dependency side effects in pack handlers.
- Preserve deterministic preview/apply behavior and idempotency.

**Non-Goals**

- Reworking publish/update/fork flows.
- Replacing plan/job runtime architecture.
- Introducing inheritance-heavy domain class hierarchy as the core abstraction.

## Architecture

### 1) Shared Lifecycle Kernel (common)

Add shared install/uninstall kernel in workspace domain with three stages:

1. `finalizeIntent` (workflow-provided)
2. operation-level planning from finalized intent (workflow-provided)
3. operation execution via shared `runOperation` abstraction

Kernel responsibilities:

- load workspace snapshot
- build canonical operation list
- run existing resolve/preview/apply pipeline
- execute operations with deterministic ordering

### 1b) Command-Family Workflows (SRP)

Define one workflow per command family and compose each from shared command primitives.

Examples:

- `runInstallCommandWorkflow` (shared by supported install handlers in this change)
- `runUninstallCommandWorkflow` (shared by supported uninstall handlers in this change)

Each family workflow may use different phases while reusing common primitives (`parse`, `resolveSource`, `discover`, `finalizeIntent`, `resolvePlan`).

Rationale:

- Preserve SRP at command-family level.
- Avoid a single cross-family workflow with many optional/no-op hooks.
- Keep command-specific UX explicit; input validation/normalization happens before operation execution.

Critical rule:

- Operation hooks MUST NOT directly mutate settings or lockfile.
- Settings/lockfile writes happen only inside shared operation execution abstractions.
- Lifecycle kernel is the sole owner of `SettingsDocument` and `LockfileDocument` writes for migrated flows.

### 2) Operation Hook Contract (type-specific lifecycle)

Introduce per-`ExtensionType` lifecycle hooks:

- derive install/uninstall intents from already discovered refs/targets
- type-specific dependency/preservation expansion
- materialization hooks only

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

Use immutable intents:

- `InstallIntent`: refs to install + preserve set
- `UninstallIntent`: identities to uninstall + preserve set

Pack hooks expand dependencies into cross-type intents.

### 4) Operation Execution Model

Canonical execution unit is the user-meaningful operation (`install-skill`, `uninstall-pack`, etc.).

- Planning unit: `PlannedOperation`
- Execution unit: `runOperation` (single executor)
- Internal implementation detail: operation workflow steps (for example materialize, lockfile update, settings update)

`SettingsDocument` and `LockfileDocument` ownership:

- Operation workflows (shared install/uninstall operation abstractions) are the only place that writes settings/lockfile.
- Extension-specific handlers provide materialization behavior only.

### 4b) Output Model (operation-oriented rendering)

Default CLI output renders operation outcomes directly.

- Default render unit: operation outcome (`operationId` + user-facing label)
- Debug/verbose render unit: internal operation workflow step trace

Aggregation rules:

1. Group execution results by `operationId`.
2. Collapse grouped results into one operation outcome using precedence:
   - `error` > `applied` > `skipped` > `no-op`
3. Choose display message/reason from highest-precedence internal step result.
4. Compute summary counts (`applied`, `skipped`, `failed`) from collapsed operation outcomes.
5. Compute `by type` from operation outcomes via each operation's target `ExtensionIdentity.type`.

This keeps CLI output aligned with user-meaningful operations while allowing finer-grained debug traces.

### 5) Target Scope placeholders for `mcp-server` and `command`

In this change, `mcp-server` and `command` lifecycle integration is intentionally no-op.

- The lifecycle kernel keeps extension points for future target-scoped behavior.
- No `mcp-server` or `command` operation execution behavior changes are introduced.

### 6) Skill Native vs Non-Native

Skill hooks branch by `PackagingKind`:

- `native`: native-specific materialization/reconciliation behavior
- `non-native`: source-backed behavior

Branching is inside hook/profile strategy, not in shared kernel.

### 7) Pack Cross-Type Behavior

Pack install/uninstall does not directly call other handlers.

- Pack hooks emit cross-type refs/identities in intent.
- Shared executor applies operation-provided hooks for materialization and state updates.

This keeps pack orchestration composable while preserving shared operation execution rules.

## Pseudocode

### A) Command-family workflows + shared primitives

```ts
// command-workflows/install.ts (shared across install command handlers)
export const runInstallCommandWorkflow = <Args, Parsed, Req, Ref, Intent>(
  args: Args,
  hooks: {
    parseArgs: (args: Args) => Effect.Effect<Parsed, CliError>;
    resolveSourceRequests: (parsed: Parsed) => Effect.Effect<ReadonlyArray<Req>, CliError>;
    discoverRefs: (reqs: ReadonlyArray<Req>) => Effect.Effect<ReadonlyArray<Ref>, CliError>;
    finalizeIntent: (parsed: Parsed, refs: ReadonlyArray<Ref>) => Effect.Effect<Intent, CliError>;
    buildPlan: (intent: Intent) => Effect.Effect<Plan, CliError>;
  },
) =>
  Effect.gen(function* () {
    const parsed = yield* hooks.parseArgs(args);
    const sourceRequests = yield* hooks.resolveSourceRequests(parsed);
    const refs = yield* hooks.discoverRefs(sourceRequests);
    const intent = yield* hooks.finalizeIntent(parsed, refs);
    const plan = yield* hooks.buildPlan(intent);
    const ws = yield* Workspace;
    yield* ws.resolvePlan(plan);
  });

// command-workflows/uninstall.ts (shared across uninstall command handlers)
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

// skills/install/handler.ts
export const handleSkillsInstall = (args: SkillsInstallHandlerArgs) =>
  runInstallCommandWorkflow(args, {
    parseArgs: parseSkillInstallArgs,
    resolveSourceRequests: resolveSkillInstallSources,
    discoverRefs: discoverSkillRefs,
    finalizeIntent: buildSkillInstallIntent,
    buildPlan: (intent) =>
      Effect.succeed({
        name: "Install skill(s)",
        jobs: [
          {
            concurrency: "unbounded",
            steps: intent.refsToInstall.map((skillRef) =>
              buildInstallOperation("install-skill", skillHooks, {
                ref: skillRef,
                preserveConfigured: intent.preserveConfigured,
              }),
            ),
          },
        ],
      }),
  });

// skills/uninstall/handler.ts
export const handleSkillsUninstall = (args: SkillsUninstallHandlerArgs) =>
  runUninstallCommandWorkflow(args, {
    parseArgs: parseSkillUninstallArgs,
    finalizeIntent: buildSkillUninstallIntent,
    buildUninstallPlan: buildSkillUninstallPlan,
  });

// packs/install/handler.ts
export const handlePacksInstall = (args: PacksInstallHandlerArgs) =>
  runInstallCommandWorkflow(args, {
    parseArgs: parsePackInstallArgs,
    resolveSourceRequests: resolvePackInstallSources,
    discoverRefs: discoverPackRefs,
    finalizeIntent: buildPackInstallIntent,
    buildPlan: buildPackInstallPlan,
  });

// packs/uninstall/handler.ts
export const handlePacksUninstall = (args: PacksUninstallHandlerArgs) =>
  runUninstallCommandWorkflow(args, {
    parseArgs: parsePackUninstallArgs,
    finalizeIntent: buildPackUninstallIntent,
    buildUninstallPlan: buildPackUninstallPlan,
  });
```

### B) Shared lifecycle kernel + operation handlers

```ts
// lifecycle-kernel.ts
type InstallIntent = {
  readonly refsToInstall: ReadonlyArray<ExtensionRef>;
  readonly preserveConfigured: ReadonlyArray<ExtensionIdentity>;
};

type UninstallIntent = {
  readonly identitiesToUninstall: ReadonlyArray<ExtensionIdentity>;
  readonly preserveConfigured: ReadonlyArray<ExtensionIdentity>;
};

type PlannedOperation = {
  readonly operationId: string;
  readonly operationName: "install-skill" | "uninstall-skill" | "install-pack" | "uninstall-pack";
  readonly displayLabel: string;
  readonly identity: ExtensionIdentity;
  readonly intent: InstallIntent | UninstallIntent;
  readonly readiness: Readiness;
  readonly hooks: ExtensionHooks<ExtensionRef>;
  readonly run: () => Effect.Effect<OperationResult, CliError, Workspace>;
};

type InstallOperationArgs<TRef extends ExtensionRef> = {
  readonly ref: TRef;
  readonly preserveConfigured: ReadonlyArray<ExtensionIdentity>;
};

type UninstallOperationArgs<TRef extends ExtensionRef> = {
  readonly identity: TRef["identity"];
  readonly preserveConfigured: ReadonlyArray<ExtensionIdentity>;
};

type ExtensionHooks<TRef extends ExtensionRef> = {
  readonly extensionType: TRef["identity"]["type"];
  readonly materializeInstall: (args: {
    readonly ref: TRef;
    readonly target: OperationTarget;
  }) => Effect.Effect<void, CliError>;
  readonly materializeUninstall: (args: {
    readonly identity: TRef["identity"];
    readonly target: OperationTarget;
  }) => Effect.Effect<void, CliError>;
};

const buildInstallOperation = <TRef extends ExtensionRef>(
  operationName: "install-skill" | "install-pack",
  extensionHooks: ExtensionHooks<TRef>,
  args: InstallOperationArgs<TRef>,
) => {
  const ref = args.ref;
  const identity = ref.identity;
  return {
    operationId: `${identity.namespace}/${identity.type}/${identity.name}`,
    operationName,
    displayLabel: identity.name,
    identity,
    intent: {
      refsToInstall: [ref],
      preserveConfigured: args.preserveConfigured,
    } satisfies InstallIntent,
    readiness: { status: "ready", message: Option.none() },
    hooks: extensionHooks,
    run: () => runInstallOperation(extensionHooks, args),
  } satisfies PlannedOperation;
};

const buildUninstallOperation = <TRef extends ExtensionRef>(
  operationName: "uninstall-skill" | "uninstall-pack",
  extensionHooks: ExtensionHooks<TRef>,
  args: UninstallOperationArgs<TRef>,
) => {
  const identity = args.identity;
  return {
    operationId: `${identity.namespace}/${identity.type}/${identity.name}`,
    operationName,
    displayLabel: identity.name,
    identity,
    intent: {
      identitiesToUninstall: [identity],
      preserveConfigured: args.preserveConfigured,
    } satisfies UninstallIntent,
    readiness: { status: "ready", message: Option.none() },
    hooks: extensionHooks,
    run: () => runUninstallOperation(extensionHooks, args),
  } satisfies PlannedOperation;
};

// Install plan construction is command-specific via the required buildPlan hook
// passed to runInstallCommandWorkflow.

// shared operation execution abstraction (install)
const runInstallOperation = <TRef extends ExtensionRef>(
  hooks: ExtensionHooks<TRef>,
  args: InstallOperationArgs<TRef>,
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const snapshot = yield* ws.readSnapshot();
    yield* materializeInstall({ ref: args.ref, hooks });
    yield* upsertLockfile({ ref: args.ref, snapshot });
    yield* upsertSettings({ ref: args.ref, preserveConfigured: args.preserveConfigured, snapshot });
    return {
      result: "success",
      message: "Applied install operation",
    } satisfies OperationResult;
  });

// shared operation execution abstraction (uninstall)
const runUninstallOperation = <TRef extends ExtensionRef>(
  hooks: ExtensionHooks<TRef>,
  args: UninstallOperationArgs<TRef>,
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const snapshot = yield* ws.readSnapshot();
    yield* materializeUninstall({ identity: args.identity, hooks });
    yield* removeLockfile({ identity: args.identity, snapshot });
    yield* removeSettings({
      identity: args.identity,
      preserveConfigured: args.preserveConfigured,
      snapshot,
    });
    return {
      result: "success",
      message: "Applied uninstall operation",
    } satisfies OperationResult;
  });
```

### B.1) Full `skill` install path pseudocode (end-to-end)

```ts
// cli-commands/skills/install/handler.ts
export const handleSkillsInstall = (args: SkillsInstallHandlerArgs) =>
  runInstallCommandWorkflow(args, {
    parseArgs: parseSkillInstallArgs,
    resolveSourceRequests: resolveSkillInstallSources,
    discoverRefs: discoverSkillRefs,
    finalizeIntent: finalizeSkillInstallIntent,
  });

// cli-commands/skills/install/finalize-intent.ts
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
      refsToInstall: selected.map((selectedRef) => selectedRef.ref),
      preserveConfigured: [],
    } satisfies InstallIntent;
  });

// extensions/skills/hooks.ts
export const skillHooks: ExtensionHooks<SkillExtensionRef> = {
  extensionType: "skill",
  materializeInstall: ({ ref, target }) => installSkillMaterialization({ ref, target }),
  materializeUninstall: ({ identity, target }) =>
    uninstallSkillMaterialization({ identity, target }),
};

// extensions/skills/operations/install.ts
// NOTE: operation handler no longer mutates settings/lockfile.
export const installSkillMaterialization: SkillMaterializeInstallHandler = ({ ref, target }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const sanitizedName = sanitizeName(ref.skill.name);

    if (ref.refType === "registry") {
      yield* materializeRegistrySkill(ref, sanitizedName);
    } else if (ref.refType === "local") {
      yield* materializeLocalSkill(ref, sanitizedName);
    } else if (ref.refType === "git-hosted") {
      yield* materializeGitHostedSkill(ref, sanitizedName);
    } else {
      yield* materializeBuiltinSkill(ref, sanitizedName);
    }

    // Agent-target materialization still belongs here (filesystem/symlink side effect).
    yield* ensureSkillLinkedForTarget({
      target,
      skillName: ref.skill.name,
    });

    return {
      result: "success",
      message: `Materialized ${ref.skill.name}`,
    } satisfies OperationResult;
  });

// No operation-family executors; a single runOperation executes plan-validated operation effects.
```

### B.2) `buildPackInstallPlan` pseudocode

```ts
// cli-commands/packs/install/build-plan.ts
export const buildPackInstallPlan = (
  intent: InstallIntent,
): Effect.Effect<Plan, CliError, Workspace> =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const snapshot = yield* ws.readSnapshot();

    const operations = intent.refsToInstall.map((ref) => {
      const isPack = ref.identity.type === "pack";

      if (!isPack && ref.identity.type !== "skill") {
        return {
          operationId: `${ref.identity.namespace}/${ref.identity.type}/${ref.identity.name}`,
          operationName: "install-pack",
          displayLabel: `${ref.identity.namespace}/${ref.identity.type}/${ref.identity.name}`,
          identity: ref.identity,
          intent: {
            refsToInstall: [ref],
            preserveConfigured: intent.preserveConfigured,
          } satisfies InstallIntent,
          readiness: {
            status: "error",
            message: `unsupported pack dependency type: ${ref.identity.type}`,
          },
          hooks: packHooks,
          run: () =>
            Effect.fail(
              makeCliError({
                code: "PACK_INSTALL_UNSUPPORTED_DEPENDENCY_TYPE",
                what: `Unsupported dependency type: ${ref.identity.type}`,
              }),
            ),
        } satisfies PlannedOperation;
      }

      const operationName = isPack ? "install-pack" : "install-skill";
      const hooks = isPack ? packHooks : skillHooks;

      const operation = buildInstallOperation(operationName, hooks, {
        ref,
        preserveConfigured: intent.preserveConfigured,
      });

      const readiness =
        operationName === "install-pack"
          ? analyzeInstallPackReadiness(snapshot, operation.intent as InstallIntent)
          : analyzeInstallSkillReadiness(snapshot, operation.intent as InstallIntent);

      return {
        ...operation,
        readiness,
      } satisfies PlannedOperation;
    });

    return {
      name: "Install pack",
      jobs: [
        {
          concurrency: 1,
          steps: operations,
        },
      ],
    } satisfies Plan;
  });
```

### C) Hook examples showing what varies

```ts
// skill hooks (native vs non-native materialization)
// Reuse `skillHooks` from `extensions/skills/hooks.ts`.

// mcp-server hooks (no-op placeholder in this change)
const mcpServerOperationHooksPlaceholder = {
  extensionType: "mcp-server",
  status: "no-op",
};

// pack hooks (materialization + preserve-configured behavior)
const packHooks: ExtensionHooks<PackExtensionRef> = {
  extensionType: "pack",
  materializeInstall: (ref, target) =>
    ref.identity.type === "pack" ? installPack(ref, target) : Effect.void,
  materializeUninstall: (identity, target) =>
    identity.type === "pack" ? uninstallPack(identity, target) : Effect.void,
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
| Install workflow             | `packages/cli/src/cli-commands/workflows/install.ts`             | new               | Shared install command orchestration (`parse -> resolveSource -> discover -> finalizeIntent -> buildPlan hook -> resolvePlan`). |
| Uninstall workflow           | `packages/cli/src/cli-commands/workflows/uninstall.ts`           | new               | Shared uninstall-family orchestration (`parse -> intent -> plan -> resolvePlan`).                                               |
| Skill install handler        | `packages/cli/src/cli-commands/skills/install/handler.ts`        | existing          | Reduced to command-specific wiring into `runInstallCommandWorkflow` hooks.                                                      |
| Skill uninstall handler      | `packages/cli/src/cli-commands/skills/uninstall/handler.ts`      | existing          | Reduced to command-specific wiring into `runUninstallCommandWorkflow` hooks.                                                    |
| Pack install handler         | `packages/cli/src/cli-commands/packs/install/handler.ts`         | existing          | Largest simplification target; source resolution/discovery/intent/plan glue moves to `runInstallCommandWorkflow`.               |
| Pack uninstall handler       | `packages/cli/src/cli-commands/packs/uninstall/handler.ts`       | existing          | Moves to `runUninstallCommandWorkflow` + pack-specific uninstall intent hook.                                                   |
| MCP-server install handler   | `packages/cli/src/cli-commands/mcp-servers/install/handler.ts`   | no-op placeholder | Explicitly out of implementation scope; retained as future integration point only.                                              |
| MCP-server uninstall handler | `packages/cli/src/cli-commands/mcp-servers/uninstall/handler.ts` | no-op placeholder | Explicitly out of implementation scope; retained as future integration point only.                                              |

### Operation handlers / lifecycle hooks

| Area                    | Path                                                              | Status               | Impact                                                                                        |
| ----------------------- | ----------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| Lifecycle kernel        | `packages/cli/src/workspace/lifecycle-kernel.ts`                  | new                  | Shared operation executor; canonical `SettingsDocument`/`LockfileDocument` updates.           |
| Extension hook types    | `packages/cli/src/workspace/operation-hooks.ts`                   | new                  | Defines shared `ExtensionHooks<TRef>` type consumed by extension features.                    |
| Skill install op        | `packages/cli/src/extensions/skills/operations/install.ts`        | existing             | Keeps materialization responsibilities; lock/settings writes removed to kernel.               |
| Skill uninstall op      | `packages/cli/src/extensions/skills/operations/uninstall.ts`      | existing             | Keeps materialization responsibilities; lock/settings writes removed to kernel.               |
| MCP-server install op   | `packages/cli/src/extensions/mcp-servers/operations/install.ts`   | no-op in this change | Existing operation remains unchanged; not migrated to lifecycle kernel yet.                   |
| MCP-server uninstall op | `packages/cli/src/extensions/mcp-servers/operations/uninstall.ts` | no-op in this change | Existing operation remains unchanged; not migrated to lifecycle kernel yet.                   |
| Pack install op         | `packages/cli/src/extensions/packs/operations/install.ts`         | existing             | Becomes pack materialization + pack intent expansion only; no direct cross-type state writes. |
| Pack uninstall op       | `packages/cli/src/extensions/packs/operations/uninstall.ts`       | existing             | Becomes pack cleanup + preserve semantics input only; no direct cross-type state writes.      |
| Skill hooks             | `packages/cli/src/extensions/skills/hooks.ts`                     | new                  | Encapsulates `PackagingKind` materialization behavior and skill execution hooks.              |
| MCP-server hooks        | `packages/cli/src/extensions/mcp-servers/hooks.ts`                | no-op placeholder    | Not implemented in this change; reserved for future `mcp-server` support.                     |
| Pack hooks              | `packages/cli/src/extensions/packs/hooks.ts`                      | new                  | Encapsulates pack materialization behavior and preserve-configured rules for supported types. |

## Simplification Analysis

This change intentionally shifts complexity from command handlers and per-extension operations into two stable seams:

- command-family workflows (install, uninstall)
- shared lifecycle kernel (canonical operation execution)

Expected simplification outcomes:

1. **Pack handlers become dramatically smaller**
   - Current pack handlers perform many concerns together (source parsing, registry probing/fallback, discovery, dependency expansion, plan assembly, lifecycle decisions, and status logging).
   - After refactor, handlers mainly bind command-specific hooks to install/uninstall family workflows.
   - Pack-specific complexity moves to one focused pack hook + intent layer.

2. **Single source of truth for workspace-state updates**
   - `SettingsDocument` / `LockfileDocument` add/remove logic is no longer repeated in migrated `skill`/`pack` operation handlers.
   - This eliminates the prior bug class where one `ExtensionType` path forgot a lockfile/settings update.

3. **Reduced cognitive load per file**
   - Handler files should read as orchestration declarations.
   - Operation files should read as materialization implementations.
   - Intent expansion (especially packs) is isolated and testable independently.

4. **SRP-aligned reuse**
   - Reuse happens at command-family level (install vs uninstall), not across unrelated command families.
   - Shared primitives stay reusable without forcing enable/disable/fork into install-shaped abstractions.

5. **Execution simplicity at operation layer**
   - Operation execution treats operation args as trusted, plan-validated intent.
   - No duplicate validation paths exist in operation handlers.
   - Operation execution focuses purely on snapshot -> internal steps -> operation result.

## Migration Plan

1. Add lifecycle kernel interfaces and shared operation execution abstraction.
2. Add shared command primitives (parse/source/discovery/intent/plan helpers).
3. Implement `runInstallCommandWorkflow` and migrate `skill`/`pack` install handlers.
4. Implement `runUninstallCommandWorkflow` and migrate `skill`/`pack` uninstall handlers.
5. Keep lifecycle kernel integration unchanged while moving handler orchestration.
6. Remove duplicated lockfile/settings writes and duplicated source/discovery orchestration from handlers.

## Risks / Trade-offs

- **Hook boundary leaks**: keep lock/settings writes private to kernel and enforce via tests.
- **Pack complexity**: cross-type expansion can produce duplicates; dedupe by identity tuple.
- **Behavior drift during migration**: use contract tests to enforce parity across extension types.
- **Future no-op confusion**: keep `mcp-server`/`command` integration explicitly labeled as no-op until supported.

## Test Strategy

- Shared contract tests (all operation hook sets):
  - install writes lockfile parity
  - uninstall removes lockfile parity
  - preserve configured entries on uninstall
  - idempotent rerun produces skip semantics
  - preview does not apply
- Type-specific tests:
  - skill native vs non-native branches
  - pack cross-type dependency expansion/preservation (supported types only)
  - `mcp-server`/`command` no-op extension points remain inert

- Command workflow tests:
  - `runInstallCommandWorkflow` phase order across `skill`/`pack` install handlers
  - `runUninstallCommandWorkflow` phase order across `skill`/`pack` uninstall handlers
  - host probe diagnostics are consistent across supported install workflows

import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type {
  InstructionsConfig,
  InstructionsConfigValue,
} from "@agentxm/extension-management/unstable/settings";
import {
  instructionProjectionEffects,
  instructionProjectionRemovalEffects,
  observeInstructionProjection,
  resolveInstructionsConfig,
  type InstructionProjectionEffect,
  type InstructionStatusItem,
} from "@agentxm/extension-management/unstable/agents";
import { previewFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/extension-management/unstable/cli-renderer";
import type {
  JobStepResult,
  JobStepArtifact,
  OperationPresentation,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";
import {
  applyPlannedProjections,
  observeProjectionPlans,
} from "@agentxm/extension-management/unstable/projection";
import { WorkspaceMutations } from "@agentxm/extension-management/unstable/workspace";
import { emitOperationResolution } from "../operation-output.js";
import { scopeFlag } from "../cli-flags.js";
import { withRuntime, withWorkspace } from "../runtime.js";
import { previewOrApplyLocalPlan } from "./shared/local-plan.js";
import { withOperationLifecycle } from "./shared/operation-lifecycle.js";
import { emitNoOpOutcome } from "./shared/no-op-output.js";
import { workspaceSettingsPath } from "./shared/workspace-display-paths.js";
import {
  disableInstructionManagement,
  instructionReconciliationReadiness,
  instructionStateIsCurrent,
  observeInstructions,
  reconcileInstructionTransition,
  removeInstructionTargetsFor,
} from "./instruction-reconciliation.js";
import {
  failureToStepFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";

interface InstructionTableItem {
  readonly agentId: string;
  readonly mechanism: string;
  readonly health: string;
  readonly ownership: string;
  readonly sourceFile: string;
  readonly targetFile: string;
}

const InstructionStatusItemSchema = Schema.Struct({
  root: Schema.String,
  agentId: Schema.String,
  agentName: Schema.String,
  sourceFile: Schema.String,
  targetFile: Schema.String,
  mechanism: Schema.String,
  health: Schema.String,
  ownership: Schema.String,
  observedForm: Schema.String,
  details: Schema.String,
});

export const InstructionsStatusOutputSchema = Schema.Struct({
  enabled: Schema.Boolean,
  sourceFileName: Schema.String,
  gitignoreAliases: Schema.Boolean,
  roots: Schema.Array(Schema.String),
  missingSources: Schema.Array(Schema.String),
  items: Schema.Array(InstructionStatusItemSchema),
  staleTargets: Schema.Array(InstructionStatusItemSchema),
});
export type InstructionsStatusOutput = typeof InstructionsStatusOutputSchema.Type;

const InstructionsTable = {
  columns: {
    agentId: { header: "Agent" },
    mechanism: { header: "Mode" },
    health: { header: "Status" },
    ownership: { header: "Ownership" },
    sourceFile: { header: "Source" },
    targetFile: { header: "Target" },
  },
} as const satisfies TableView<InstructionTableItem>;

const toTableItem = (item: InstructionStatusItem): InstructionTableItem => ({
  agentId: item.agentId,
  mechanism: item.mechanism,
  health: item.health,
  ownership: item.ownership,
  sourceFile: item.sourceFile,
  targetFile: item.targetFile,
});

// Instruction-file targets are a workspace capability, not rule extensions, so
// this entity stays under its own id. The catalog entity for the `rule` type is
// registered by `rules/list.ts` (parity obligation 8.6).
registerEntity<InstructionTableItem>("agent-rule", {
  list: {
    columns: InstructionsTable.columns,
    emptyMessage: "No instruction files configured",
    singularLabel: "instruction file",
    pluralLabel: "instruction files",
  },
});

const currentInstructionsConfig = Effect.fn("Instructions.currentConfig")(function* () {
  const ws = yield* WorkspaceMutations;
  const config = yield* ws.getInstructionsConfig().pipe(Effect.mapError(toAppError));
  if (Option.isNone(config) || config.value === false) return Option.none();
  return Option.some(resolveInstructionsConfig(config.value));
});

const rawInstructionsConfigEquals = (
  value: InstructionsConfigValue,
  expected: InstructionsConfig,
): boolean => {
  if (value === false) return false;
  const resolved = resolveInstructionsConfig(value);
  return (
    resolved.fileName === expected.fileName &&
    resolved.gitignoreAliases === expected.gitignoreAliases
  );
};

const makeInstructionsConfigPlan = (args: {
  readonly name: string;
  readonly description: string;
  readonly verb: OperationPresentation["verb"];
  readonly step: PlannedJobStep;
}): Plan => ({
  _tag: "Plan",
  name: args.name,
  description: Option.some(args.description),
  presentation: {
    verb: args.verb,
    subject: { singular: "instruction file", plural: "instruction files" },
  },
  jobs: [
    {
      concurrency: 1,
      steps: [args.step],
    },
  ],
});

const makeInstructionArtifact = (args: {
  readonly ws: { readonly baseDir: string; readonly scope: "project" | "user" };
  readonly path: Path.Path;
  readonly effects: ReadonlyArray<InstructionProjectionEffect>;
}): JobStepArtifact => {
  const settings = workspaceSettingsPath(args.ws.scope);
  const byPath = new Map<
    string,
    { readonly path: string; readonly change: "created" | "updated" | "removed" }
  >();
  byPath.set(settings, { path: settings, change: "updated" });
  for (const effect of args.effects) {
    const relative = args.path.relative(args.ws.baseDir, effect.path);
    byPath.set(relative, { path: relative, change: effect.change });
  }
  return {
    path: settings,
    scope: args.ws.scope,
    change: "updated",
    targets: [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
  };
};

export const handleInstructionsStatus = Effect.fn("Instructions.inspect")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const config = yield* currentInstructionsConfig();

  if (Option.isNone(config)) {
    const output = {
      enabled: false,
      sourceFileName: "AGENTS.md",
      gitignoreAliases: false,
      roots: [],
      missingSources: [],
      items: [],
      staleTargets: [],
    };
    if (yield* renderer.result(output, InstructionsStatusOutputSchema)) return;
    yield* renderer.list("agent-rule", {
      items: [],
      count: 0,
      emptyMessage: "Instruction-file management is disabled.",
    });
    return;
  }

  const configuredAgents = yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));
  const { status } = yield* observeInstructionProjection({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    configuredAgents,
    config: config.value,
  });

  if (yield* renderer.result(status, InstructionsStatusOutputSchema)) return;
  // Stale rows follow the configured rows so residue AXM still owns is visible
  // beside the targets it currently maintains.
  const tableItems = [...status.items, ...status.staleTargets].map(toTableItem);
  if (tableItems.length === 0) {
    yield* renderer.list("agent-rule", {
      items: [],
      count: 0,
      emptyMessage: "No configured agents need instruction-file propagation.",
    });
    return;
  }
  yield* renderer.list("agent-rule", {
    items: tableItems,
    count: tableItems.length,
  });
});

export const handleInstructionsEnable = (args: {
  readonly fileName: string;
  readonly gitignore: boolean;
  readonly preview?: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "instructions.enable",
      mode: args.preview === true ? "preview" : "apply",
      planName: "Enable instruction-file management",
    },
    handleInstructionsEnableBody(args),
  );

const handleInstructionsEnableBody = Effect.fn("Instructions.enable")(function* (args: {
  readonly fileName: string;
  readonly gitignore: boolean;
  readonly preview?: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const ruleManager = yield* RuleManager;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = {
    fileName: args.fileName,
    gitignoreAliases: args.gitignore,
  } satisfies InstructionsConfig;
  const current = yield* ws.getInstructionsConfig().pipe(Effect.mapError(toAppError));

  const resolvedConfig = resolveInstructionsConfig(config);
  const previousConfig =
    Option.isSome(current) && current.value !== false
      ? Option.some(resolveInstructionsConfig(current.value))
      : Option.none();
  const configChanged =
    Option.isSome(previousConfig) &&
    (previousConfig.value.fileName !== resolvedConfig.fileName ||
      previousConfig.value.gitignoreAliases !== resolvedConfig.gitignoreAliases);
  const observed = yield* observeInstructions({ ws, config: resolvedConfig });
  const alreadyCurrent =
    Option.isSome(current) &&
    rawInstructionsConfigEquals(current.value, config) &&
    instructionStateIsCurrent(observed);
  if (alreadyCurrent) {
    yield* emitNoOpOutcome("instructions.enable", {
      planName: "Enable instruction-file management",
      message: "Instruction-file management is already enabled.",
      withoutSuggestions: true,
    });
    return;
  }

  // A changed configuration is preflighted against the aliases the previous
  // configuration owns, because those are the files the transition removes.
  const preflight =
    configChanged && Option.isSome(previousConfig)
      ? yield* observeInstructions({ ws, config: previousConfig.value })
      : observed;
  const ruleEffects = (yield* ruleManager
    .projectionPlans()
    .pipe(Effect.flatMap(observeProjectionPlans)))
    .filter((observation) => !observation.current)
    .map((observation) => ({
      path: path.resolve(ws.baseDir, observation.path.split("#", 1)[0] ?? observation.path),
      change: "updated" as const,
    }));
  const artifact = makeInstructionArtifact({
    ws,
    path,
    effects: [
      ...(configChanged ? instructionProjectionRemovalEffects(preflight) : []),
      ...ruleEffects,
      ...instructionProjectionEffects(observed),
    ],
  });
  const readiness = yield* instructionReconciliationReadiness({ ws, snapshot: preflight });
  const step: PlannedJobStep = Option.match(readiness, {
    onNone: () => ({
      label: "Enable instruction-file management",
      readiness: "ready",
      artifact,
      run: ws
        .runTransaction({
          transition: reconcileInstructionTransition({
            ws,
            config: resolvedConfig,
            ...(configChanged && Option.isSome(previousConfig)
              ? { preflightConfig: previousConfig.value }
              : {}),
            transition: Effect.gen(function* () {
              if (configChanged && Option.isSome(previousConfig)) {
                yield* removeInstructionTargetsFor({ ws, config: previousConfig.value });
              }
              yield* ws.setInstructionsConfig(config).pipe(Effect.mapError(toAppError));
              yield* applyPlannedProjections(ruleManager);
            }).pipe(
              Effect.mapError(toAppError),
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            ),
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
          validate: () => Effect.void,
        })
        .pipe(
          Effect.mapError(failureToStepFailure),
          Effect.as({
            result: "success",
            message: "Enabled and reconciled instruction-file management",
            artifact,
          } satisfies JobStepResult),
        ),
    }),
    onSome: (error) => ({
      label: "Enable instruction-file management",
      readiness: "error",
      errorMessage: error.detail,
    }),
  });
  const resolution = yield* previewOrApplyLocalPlan(
    makeInstructionsConfigPlan({
      name: "Enable instruction-file management",
      description: `Use ${config.fileName} as the source instruction file`,
      verb: { imperative: "enable", past: "Enabled", gerund: "Enabling" },
      step,
    }),
    { preview: args.preview === true },
  );
  yield* emitOperationResolution("instructions.enable", resolution);
});

export const handleInstructionsDisable = (args?: { readonly preview?: boolean }) =>
  withOperationLifecycle(
    {
      command: "instructions.disable",
      mode: args?.preview === true ? "preview" : "apply",
      planName: "Disable instruction-file management",
    },
    handleInstructionsDisableBody(args),
  );

const handleInstructionsDisableBody = Effect.fn("Instructions.disable")(function* (args?: {
  readonly preview?: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const current = yield* ws.getInstructionsConfig().pipe(Effect.mapError(toAppError));

  if (Option.isNone(current) || current.value === false) {
    yield* emitNoOpOutcome("instructions.disable", {
      planName: "Disable instruction-file management",
      message: "Instruction-file management is already disabled.",
      withoutSuggestions: true,
    });
    return;
  }

  const config = resolveInstructionsConfig(current.value);
  const snapshot = yield* observeInstructions({ ws, config });
  const artifact = makeInstructionArtifact({
    ws,
    path,
    effects: instructionProjectionRemovalEffects(snapshot),
  });
  const readiness = yield* instructionReconciliationReadiness({ ws, snapshot });
  const step: PlannedJobStep = Option.match(readiness, {
    onNone: () => ({
      label: "Disable instruction-file management",
      readiness: "ready",
      artifact,
      run: ws
        .runTransaction({
          transition: disableInstructionManagement({ ws, config }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
          validate: () => Effect.void,
        })
        .pipe(
          Effect.mapError(failureToStepFailure),
          Effect.as({
            result: "success",
            message: "Disabled instruction-file management and removed owned aliases",
            artifact,
          } satisfies JobStepResult),
        ),
    }),
    onSome: (error) => ({
      label: "Disable instruction-file management",
      readiness: "error",
      errorMessage: error.detail,
    }),
  });
  const resolution = yield* previewOrApplyLocalPlan(
    makeInstructionsConfigPlan({
      name: "Disable instruction-file management",
      description: "Turn off instruction-file propagation",
      verb: { imperative: "disable", past: "Disabled", gerund: "Disabling" },
      step,
    }),
    { preview: args?.preview === true },
  );
  yield* emitOperationResolution("instructions.disable", resolution);
});

const instructionsStatusConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level configuration"),
  ),
} as const;

const instructionsEnableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable project (default) or user-level configuration"),
  ),
  fileName: Flag.string("file").pipe(
    Flag.withDescription("Source-of-truth instruction file"),
    Flag.withDefault("AGENTS.md"),
  ),
  gitignore: Flag.boolean("gitignore").pipe(
    Flag.withDescription("Manage propagated alias files in .gitignore"),
    Flag.withDefault(true),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

const instructionsDisableConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable project (default) or user-level configuration"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without disabling")),
} as const;

const instructionsEnableCommand = Command.make(
  "enable",
  instructionsEnableConfig,
  ({ scope, fileName, gitignore, preview }) =>
    handleInstructionsEnable({ fileName, gitignore, preview }).pipe(
      withWorkspace(scope),
      withRuntime("instructions enable"),
    ),
).pipe(
  withArgvTracking(instructionsEnableConfig),
  Command.withDescription("Enable instruction-file management"),
  Command.withExamples([
    { command: "axm instructions enable", description: "Enable instruction files" },
    {
      command: "axm instructions enable --no-gitignore",
      description: "Enable without writing alias gitignore entries",
    },
  ]),
);

const instructionsDisableCommand = Command.make(
  "disable",
  instructionsDisableConfig,
  ({ scope, preview }) =>
    handleInstructionsDisable({ preview }).pipe(
      withWorkspace(scope),
      withRuntime("instructions disable"),
    ),
).pipe(
  withArgvTracking(instructionsDisableConfig),
  Command.withDescription("Disable instruction-file management"),
  Command.withExamples([
    { command: "axm instructions disable", description: "Disable instruction files" },
  ]),
);

export const instructionsCommand = Command.make(
  "instructions",
  instructionsStatusConfig,
  ({ scope }) => handleInstructionsStatus().pipe(withWorkspace(scope), withRuntime("instructions")),
).pipe(
  withArgvTracking(instructionsStatusConfig),
  Command.withDescription("Inspect and manage workspace instruction files"),
  Command.withExamples([
    { command: "axm instructions", description: "Inspect instruction files" },
    {
      command: "axm sync --preview",
      description: "Preview instruction-file reconciliation",
    },
  ]),
  Command.withSubcommands([instructionsEnableCommand, instructionsDisableCommand]),
);

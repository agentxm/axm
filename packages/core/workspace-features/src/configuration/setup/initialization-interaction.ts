import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import type { ArtifactChange, OperationRefused } from "@agentxm/workspace-kernel/operations";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";

/**
 * Typed cancellation of workspace initialization. The CLI implementation maps
 * a prompt cancellation into this kernel-owned error; the runtime envelope
 * treats it as a cancelled (successful) exit.
 */
export class WorkspaceInitializationCancelled extends Data.TaggedError(
  "WorkspaceInitializationCancelled",
)<{ readonly message: string }> {}

export interface InstructionSourceChoice {
  readonly fileName: string;
  readonly exists: boolean;
  readonly lines: number;
}

/**
 * What setup would do to one target: write it anew, change it, leave one that
 * already agrees, link or copy an agent's instruction file to the shared
 * source, pass over an agent that has no instruction convention, or refuse a
 * target whose differing content AXM has no record of writing.
 */
export const SetupPlanActionSchema = Schema.Literals([
  "create",
  "update",
  "in sync",
  "link",
  "copy",
  "skip",
  "remove",
  "blocked",
  "warning",
]);
export type SetupPlanAction = typeof SetupPlanActionSchema.Type;

/** Facts shared by the confirmation ledger and machine report. */
export const SetupPlanDetailSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("settings"),
    agentIds: Schema.Array(Schema.String),
    instructionFiles: Schema.optional(
      Schema.Union([Schema.Literal(false), Schema.Struct({ fileName: Schema.String })]),
    ),
  }),
  Schema.Struct({ _tag: Schema.Literal("gitignore") }),
  Schema.Struct({
    _tag: Schema.Literal("instructionSource"),
    seededFrom: Schema.optional(Schema.String),
    deferred: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    _tag: Schema.Literal("instructionTarget"),
    agentName: Schema.String,
    seededAlias: Schema.optional(Schema.Boolean),
    blocked: Schema.optional(Schema.Boolean),
    reason: Schema.optional(Schema.String),
  }),
  Schema.Struct({ _tag: Schema.Literal("missingInstructionConvention") }),
  Schema.Struct({ _tag: Schema.Literal("acceptedResolution") }),
  Schema.Struct({ _tag: Schema.Literal("bundledSkill"), reason: Schema.optional(Schema.String) }),
  Schema.Struct({
    _tag: Schema.Literal("nativeOutputConcern"),
    concern: Schema.Union([
      Schema.Struct({
        kind: Schema.Literal("broken-link"),
        path: Schema.String,
        target: Schema.String,
      }),
      Schema.Struct({
        kind: Schema.Literal("unreadable"),
        path: Schema.String,
        reason: Schema.String,
      }),
      Schema.Struct({
        kind: Schema.Literal("collision"),
        path: Schema.String,
        otherPath: Schema.String,
        entryName: Schema.String,
        extensionType: Schema.Literals(["skill", "subagent"]),
        agentIds: Schema.Array(Schema.String),
      }),
    ]),
  }),
]);
export type SetupPlanDetail = typeof SetupPlanDetailSchema.Type;
export interface SetupPlanRow {
  readonly target: string;
  readonly action: SetupPlanAction;
  readonly change?: ArtifactChange | undefined;
  readonly detail: SetupPlanDetail;
  readonly agentIds?: ReadonlyArray<string> | undefined;
}

/** Agent-detection summary presented before agent selection. */
export interface SetupAgentScan {
  readonly detectedCount: number;
  readonly retiredAgents: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

export interface WorkspaceInitializationInteractionService {
  readonly selectAgents: (options: {
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
    readonly projectDetectedIds: ReadonlyArray<string>;
    readonly userDetectedIds: ReadonlyArray<string>;
    readonly suggestedIds: ReadonlyArray<string>;
    readonly configuredIds: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<string>, WorkspaceInitializationCancelled | OperationRefused>;
  readonly confirmInstructionSync: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, WorkspaceInitializationCancelled | OperationRefused>;
  readonly selectInstructionSource: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, WorkspaceInitializationCancelled | OperationRefused>;
  readonly confirmSetupPlan: () => Effect.Effect<
    boolean,
    WorkspaceInitializationCancelled | OperationRefused
  >;
  /** Present the agent scan summary. The implementation owns all wording. */
  readonly presentAgentScan: (scan: SetupAgentScan) => Effect.Effect<void, OperationRefused>;
  /** Present the setup plan rows before confirmation. */
  readonly presentSetupPlan: (
    rows: ReadonlyArray<SetupPlanRow>,
  ) => Effect.Effect<void, OperationRefused>;
}

export class WorkspaceInitializationInteraction extends ServiceMap.Service<
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionService
>()(
  "@agentxm/workspace-features/configuration/initialization-interaction/WorkspaceInitializationInteraction",
) {}

export interface WorkspaceInitializationInteractionTestState {
  readonly selectAgentsCalls: Array<{
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
    readonly projectDetectedIds: ReadonlyArray<string>;
    readonly userDetectedIds: ReadonlyArray<string>;
    readonly suggestedIds: ReadonlyArray<string>;
    readonly configuredIds: ReadonlyArray<string>;
  }>;
  readonly confirmInstructionSyncCalls: Array<{ readonly enabled: boolean }>;
  readonly selectInstructionSourceCalls: Array<{
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }>;
  readonly confirmSetupPlanCalls: Array<null>;
  readonly presentAgentScanCalls: Array<SetupAgentScan>;
  readonly presentSetupPlanCalls: Array<ReadonlyArray<SetupPlanRow>>;
}

export const WorkspaceInitializationInteractionTest = (overrides?: {
  readonly selectAgents?: (options: {
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
    readonly projectDetectedIds: ReadonlyArray<string>;
    readonly userDetectedIds: ReadonlyArray<string>;
    readonly suggestedIds: ReadonlyArray<string>;
    readonly configuredIds: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<string>, WorkspaceInitializationCancelled | OperationRefused>;
  readonly confirmInstructionSync?: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, WorkspaceInitializationCancelled | OperationRefused>;
  readonly selectInstructionSource?: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, WorkspaceInitializationCancelled | OperationRefused>;
  readonly confirmSetupPlan?: () => Effect.Effect<
    boolean,
    WorkspaceInitializationCancelled | OperationRefused
  >;
}) => {
  const state: WorkspaceInitializationInteractionTestState = {
    selectAgentsCalls: [],
    confirmInstructionSyncCalls: [],
    selectInstructionSourceCalls: [],
    confirmSetupPlanCalls: [],
    presentAgentScanCalls: [],
    presentSetupPlanCalls: [],
  };

  const layer = Layer.succeed(WorkspaceInitializationInteraction, {
    selectAgents: (options) =>
      Effect.gen(function* () {
        state.selectAgentsCalls.push(options);
        return yield* overrides?.selectAgents?.(options) ??
          Effect.succeed([...new Set([...options.configuredIds, ...options.suggestedIds])]);
      }),
    confirmInstructionSync: (options) =>
      Effect.gen(function* () {
        state.confirmInstructionSyncCalls.push(options);
        return yield* overrides?.confirmInstructionSync?.(options) ??
          Effect.succeed(options.enabled);
      }),
    selectInstructionSource: (options) =>
      Effect.gen(function* () {
        state.selectInstructionSourceCalls.push(options);
        return yield* overrides?.selectInstructionSource?.(options) ??
          Effect.succeed(options.defaultFileName);
      }),
    confirmSetupPlan: () =>
      Effect.gen(function* () {
        state.confirmSetupPlanCalls.push(null);
        return yield* overrides?.confirmSetupPlan?.() ?? Effect.succeed(true);
      }),
    presentAgentScan: (scan) =>
      Effect.sync(() => {
        state.presentAgentScanCalls.push(scan);
      }),
    presentSetupPlan: (rows) =>
      Effect.sync(() => {
        state.presentSetupPlanCalls.push(rows);
      }),
  } satisfies WorkspaceInitializationInteractionService);

  return { layer, state };
};

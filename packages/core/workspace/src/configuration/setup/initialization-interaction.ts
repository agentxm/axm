import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";
import type { WorkspaceConfigurationFailed } from "../errors.js";

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
 * source, or pass over an agent that has no instruction convention.
 */
export type SetupPlanAction = "create" | "update" | "in sync" | "link" | "copy" | "skip";

/** Structured facts the presenting adapter turns into setup-plan wording. */
export type SetupPlanDetail =
  | { readonly _tag: "settings"; readonly agentIds: ReadonlyArray<string> }
  | { readonly _tag: "gitignore" }
  | { readonly _tag: "instructionSource"; readonly seededFrom?: string }
  | { readonly _tag: "instructionTarget"; readonly agentName: string }
  | { readonly _tag: "missingInstructionConvention" }
  | { readonly _tag: "acceptedResolution" };

/** One row of the setup plan presented before confirmation. */
export interface SetupPlanRow {
  readonly target: string;
  readonly action: SetupPlanAction;
  readonly detail: SetupPlanDetail;
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
  }) => Effect.Effect<
    ReadonlyArray<string>,
    WorkspaceInitializationCancelled | WorkspaceConfigurationFailed
  >;
  readonly confirmInstructionSync: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, WorkspaceInitializationCancelled | WorkspaceConfigurationFailed>;
  readonly selectInstructionSource: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, WorkspaceInitializationCancelled | WorkspaceConfigurationFailed>;
  readonly confirmSetupPlan: () => Effect.Effect<
    boolean,
    WorkspaceInitializationCancelled | WorkspaceConfigurationFailed
  >;
  /** Present the agent scan summary. The implementation owns all wording. */
  readonly presentAgentScan: (scan: SetupAgentScan) => Effect.Effect<void>;
  /** Present the setup plan rows before confirmation. */
  readonly presentSetupPlan: (rows: ReadonlyArray<SetupPlanRow>) => Effect.Effect<void>;
}

export class WorkspaceInitializationInteraction extends ServiceMap.Service<
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionService
>()(
  "@agentxm/workspace/configuration/initialization-interaction/WorkspaceInitializationInteraction",
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
  }) => Effect.Effect<
    ReadonlyArray<string>,
    WorkspaceInitializationCancelled | WorkspaceConfigurationFailed
  >;
  readonly confirmInstructionSync?: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, WorkspaceInitializationCancelled | WorkspaceConfigurationFailed>;
  readonly selectInstructionSource?: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, WorkspaceInitializationCancelled | WorkspaceConfigurationFailed>;
  readonly confirmSetupPlan?: () => Effect.Effect<
    boolean,
    WorkspaceInitializationCancelled | WorkspaceConfigurationFailed
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
          Effect.succeed([
            ...new Set([
              ...options.configuredIds,
              ...options.projectDetectedIds,
              ...options.suggestedIds,
            ]),
          ]);
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

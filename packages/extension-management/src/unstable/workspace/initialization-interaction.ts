import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";
import type { AppError } from "../app-error/index.js";
import type { WorkspaceScope } from "./scope.js";
import type { SetupScopeSupportCategory } from "./setup-scope-support.js";

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

/** One row of the setup plan presented before confirmation. */
export interface SetupPlanRow {
  readonly target: string;
  readonly action: string;
  readonly detail: string;
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
  }) => Effect.Effect<ReadonlyArray<string>, WorkspaceInitializationCancelled | AppError>;
  readonly confirmInstructionSync: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, WorkspaceInitializationCancelled | AppError>;
  readonly selectInstructionSource: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, WorkspaceInitializationCancelled | AppError>;
  readonly confirmSetupPlan: () => Effect.Effect<
    boolean,
    WorkspaceInitializationCancelled | AppError
  >;
  /** Present the agent scan summary. The implementation owns all wording. */
  readonly presentAgentScan: (scan: SetupAgentScan) => Effect.Effect<void>;
  /** Present the setup plan rows before confirmation. */
  readonly presentSetupPlan: (rows: ReadonlyArray<SetupPlanRow>) => Effect.Effect<void>;
  /** Present per-category scope-support outcomes for the selected agents. */
  readonly presentScopeSupport: (
    scope: WorkspaceScope,
    categories: ReadonlyArray<SetupScopeSupportCategory>,
  ) => Effect.Effect<void>;
}

export class WorkspaceInitializationInteraction extends ServiceMap.Service<
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionService
>()(
  "@agentxm/extension-management/unstable/workspace/initialization-interaction/WorkspaceInitializationInteraction",
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
  readonly presentScopeSupportCalls: Array<{
    readonly scope: WorkspaceScope;
    readonly categories: ReadonlyArray<SetupScopeSupportCategory>;
  }>;
}

export const WorkspaceInitializationInteractionTest = (overrides?: {
  readonly selectAgents?: (options: {
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
    readonly projectDetectedIds: ReadonlyArray<string>;
    readonly userDetectedIds: ReadonlyArray<string>;
    readonly suggestedIds: ReadonlyArray<string>;
    readonly configuredIds: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<string>, WorkspaceInitializationCancelled | AppError>;
  readonly confirmInstructionSync?: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, WorkspaceInitializationCancelled | AppError>;
  readonly selectInstructionSource?: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, WorkspaceInitializationCancelled | AppError>;
  readonly confirmSetupPlan?: () => Effect.Effect<
    boolean,
    WorkspaceInitializationCancelled | AppError
  >;
}) => {
  const state: WorkspaceInitializationInteractionTestState = {
    selectAgentsCalls: [],
    confirmInstructionSyncCalls: [],
    selectInstructionSourceCalls: [],
    confirmSetupPlanCalls: [],
    presentAgentScanCalls: [],
    presentSetupPlanCalls: [],
    presentScopeSupportCalls: [],
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
    presentScopeSupport: (scope, categories) =>
      Effect.sync(() => {
        state.presentScopeSupportCalls.push({ scope, categories });
      }),
  } satisfies WorkspaceInitializationInteractionService);

  return { layer, state };
};

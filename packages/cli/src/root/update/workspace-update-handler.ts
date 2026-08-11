import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import { previewOrApplyPlan, type PlanResolution } from "@agentxm/client-core/unstable/plan";

import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { buildWorkspaceUpdatePlan, type WorkspaceUpdatableType } from "./workspace-update.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";

const workspaceUpdateSubjectType = (type: Option.Option<WorkspaceUpdatableType>): SubjectType =>
  Option.match(type, {
    onNone: () => "mixed" as const,
    onSome: (value) => value,
  });

export interface WorkspaceUpdateFlags {
  readonly yes: boolean;
  readonly preview: boolean;
  readonly force?: boolean;
}

const workspaceUpdateCommand = (
  type: Option.Option<WorkspaceUpdatableType>,
): ReadonlyArray<string> =>
  Option.match(type, {
    onNone: () => ["update"],
    onSome: (value) => {
      switch (value) {
        case "skill":
          return ["skills", "update"];
        case "mcp-server":
          return ["mcps", "update"];
        case "subagent":
          return ["subagents", "update"];
        case "rule":
          return ["rules", "update"];
        case "hook":
          return ["hooks", "update"];
        case "knowledge":
          return ["knowledge", "update"];
        case "pack":
          return ["packs", "update"];
      }
    },
  });

export const handleWorkspaceUpdate = (args: {
  readonly command: string;
  readonly type: Option.Option<WorkspaceUpdatableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceUpdateFlags;
  /** Installed names a selector resolved to; omit to update every entry. */
  readonly names?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const planResult = yield* buildWorkspaceUpdatePlan({
      type: args.type,
      planName: args.planName,
      planDescription: args.planDescription,
      ...(args.names === undefined ? {} : { names: args.names }),
    });

    if (planResult._tag === "NoConfiguredExtensions") {
      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "no-op",
          subjectType: workspaceUpdateSubjectType(args.type),
          sourceKind: "workspace",
        }),
      );
      yield* emitNoOpOutcome(args.command, {
        planName: args.planName,
        message: planResult.message,
        ...Option.match(args.planDescription, {
          onNone: () => ({}),
          onSome: (planDescription) => ({ planDescription }),
        }),
      });
      return;
    }

    const execution = yield* makePlanExecution(
      args.flags,
      makeConfirmationRecovery(workspaceUpdateCommand(args.type), [
        recoverySwitch("--refresh", args.flags.force === true),
        ...(args.names ?? []).map((name) => recoveryOption("--name", publicRecoveryValue(name))),
      ]),
    );
    const resolution = yield* previewOrApplyPlan(planResult.plan, { execution });
    const outputResolution: PlanResolution = resolution;
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        planResolutionToSummary(outputResolution, {
          subjectType: workspaceUpdateSubjectType(args.type),
          sourceKind: "workspace",
        }),
      ),
    );
    yield* emitPlanResolutionResult(args.command, outputResolution);
  });

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import { previewOrApplyPlan, type PlanResolution } from "@agentxm/client-core/unstable/plan";

import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { buildWorkspaceUpdatePlan, type WorkspaceUpdatableType } from "./workspace-update.js";

const workspaceUpdateSubjectType = (type: Option.Option<WorkspaceUpdatableType>): SubjectType =>
  Option.match(type, {
    onNone: () => "mixed" as const,
    onSome: (value) => value,
  });

export interface WorkspaceUpdateFlags {
  readonly yes: boolean;
  readonly preview: boolean;
}

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

    const resolution = yield* previewOrApplyPlan(planResult.plan, {
      yes: args.flags.yes,
      preview: args.flags.preview,
    });
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

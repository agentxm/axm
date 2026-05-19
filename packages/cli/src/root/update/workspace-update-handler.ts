import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";

import {
  emitNoOpResult,
  emitPlanResolutionResult,
  planResolutionToSummary,
} from "../../json-output.js";
import { runContextFilesWorkspaceGeneratorPhase } from "../context-files/workspace-generator-phase.js";
import { buildWorkspaceUpdatePlan, type WorkspaceUpdatableType } from "./workspace-update.js";

const workspaceUpdateSubjectType = (type: Option.Option<WorkspaceUpdatableType>): SubjectType =>
  Option.match(type, {
    onNone: () => "mixed" as const,
    onSome: (value) => value,
  });

export interface WorkspaceUpdateFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleWorkspaceUpdate = (args: {
  readonly command: string;
  readonly type: Option.Option<WorkspaceUpdatableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceUpdateFlags;
}) =>
  Effect.gen(function* () {
    const planResult = yield* buildWorkspaceUpdatePlan({
      type: args.type,
      planName: args.planName,
      planDescription: args.planDescription,
    });

    if (planResult._tag === "NoConfiguredExtensions") {
      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "no-op",
          subjectType: workspaceUpdateSubjectType(args.type),
          sourceKind: "workspace",
        }),
      );
      yield* emitNoOpResult(args.command, {
        planName: args.planName,
        message: planResult.message,
        ...Option.match(args.planDescription, {
          onNone: () => ({}),
          onSome: (planDescription) => ({ planDescription }),
        }),
      });
      return;
    }

    const resolution = yield* previewOrApplyPlan(planResult.plan, args.flags);
    if (!args.flags.preview && (Option.isNone(args.type) || args.type.value === "file")) {
      yield* runContextFilesWorkspaceGeneratorPhase({ dryRun: false });
    }
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        planResolutionToSummary(resolution, {
          subjectType: workspaceUpdateSubjectType(args.type),
          sourceKind: "workspace",
        }),
      ),
    );
    yield* emitPlanResolutionResult(args.command, resolution);
  });

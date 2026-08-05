import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import { previewOrApplyPlan, type PlanResolution } from "@agentxm/client-core/unstable/plan";

import { planResolutionToSummary, toPlanResolutionResult } from "../../json-output.js";
import {
  mergePlanResolution,
  runFilesWorkspaceGeneratorPhase,
} from "../files/workspace-generator-phase.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../shared/applied-plan-output.js";
import { buildWorkspaceInstallPlan, type WorkspaceInstallableType } from "./workspace-install.js";

const workspaceInstallSubjectType = (type: Option.Option<WorkspaceInstallableType>): SubjectType =>
  Option.match(type, {
    onNone: () => "mixed" as const,
    onSome: (value) => value,
  });

export interface WorkspaceInstallFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleWorkspaceInstall = (args: {
  readonly command: string;
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceInstallFlags;
}) =>
  Effect.gen(function* () {
    const planResult = yield* buildWorkspaceInstallPlan({
      type: args.type,
      planName: args.planName,
      planDescription: args.planDescription,
    });

    if (planResult._tag === "NoConfiguredExtensions") {
      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "no-op",
          subjectType: workspaceInstallSubjectType(args.type),
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

    const resolution = yield* previewOrApplyPlan(planResult.plan, args.flags);
    let outputResolution: PlanResolution = resolution;
    if (!args.flags.preview && (Option.isNone(args.type) || args.type.value === "files")) {
      const workspaceGeneratorResolution = yield* runFilesWorkspaceGeneratorPhase({
        dryRun: false,
      });
      outputResolution = mergePlanResolution(resolution, workspaceGeneratorResolution);
    }
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        planResolutionToSummary(outputResolution, {
          subjectType: workspaceInstallSubjectType(args.type),
          sourceKind: "workspace",
        }),
      ),
    );
    const result = toPlanResolutionResult(outputResolution);
    yield* emitAppliedPlanOutcome({
      command: args.command,
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(outputResolution, "Configured extensions are already up to date")
          : args.planName,
      resolution: outputResolution,
      reportInstallationCoverage: Option.isNone(args.type) || args.type.value !== "knowledge",
      suggestions: [{ description: "Inspect workspace status", cmd: "axm status" }],
    });
  });

export const runWorkspaceInstall = (args: {
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceInstallFlags;
}) =>
  Effect.gen(function* () {
    const planResult = yield* buildWorkspaceInstallPlan({
      type: args.type,
      planName: args.planName,
      planDescription: args.planDescription,
    });

    if (planResult._tag === "NoConfiguredExtensions") {
      return Option.none<PlanResolution>();
    }

    const resolution = yield* previewOrApplyPlan(planResult.plan, args.flags);
    return Option.some(resolution);
  });

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { previewOrApplyPlan, type PlanResolution } from "@axm.sh/core/unstable/workspace";

import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { buildWorkspaceInstallPlan, type WorkspaceInstallableType } from "./workspace-install.js";

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
    yield* emitPlanResolutionResult(args.command, resolution);
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

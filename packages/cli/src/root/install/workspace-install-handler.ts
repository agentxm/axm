import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  recoverySwitch,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "@agentxm/client-core/unstable/cli-runtime";
import { operationPresentation, previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";

import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { buildWorkspaceInstallPlan, type WorkspaceInstallableType } from "./workspace-install.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";

const workspaceInstallSubjectType = (type: Option.Option<WorkspaceInstallableType>): SubjectType =>
  Option.match(type, {
    onNone: () => "mixed" as const,
    onSome: (value) => value,
  });

const workspaceInstallCommand = (
  type: Option.Option<WorkspaceInstallableType>,
): ReadonlyArray<string> =>
  Option.match(type, {
    onNone: () => ["install"],
    onSome: (value) => {
      switch (value) {
        case "skill":
          return ["skills", "install"];
        case "mcp-server":
          return ["mcps", "install"];
        case "subagent":
          return ["subagents", "install"];
        case "rule":
          return ["rules", "install"];
        case "hook":
          return ["hooks", "install"];
        case "knowledge":
          return ["knowledge", "install"];
        case "pack":
          return ["packs", "install"];
      }
    },
  });

export interface WorkspaceInstallFlags {
  readonly yes: boolean;
  readonly preview: boolean;
  readonly force?: boolean;
  readonly ignoreReleaseAge?: boolean;
}

export const handleWorkspaceInstall = (args: {
  readonly command: string;
  readonly type: Option.Option<WorkspaceInstallableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceInstallFlags;
}) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.flags.preview ? "preview" : "apply",
      planName: args.planName,
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        Option.getOrUndefined(args.type),
      ),
    },
    handleWorkspaceInstallBody(args),
  );

const handleWorkspaceInstallBody = (args: {
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
      ignoreReleaseAge: args.flags.ignoreReleaseAge === true,
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

    const execution = yield* makePlanExecution(
      args.flags,
      makeConfirmationRecovery(workspaceInstallCommand(args.type), [
        recoverySwitch("--reinstall", args.flags.force === true),
        recoverySwitch("--ignore-release-age", args.flags.ignoreReleaseAge === true),
      ]),
      [],
      planResult.configuredAgentOperations,
    );
    const resolution = yield* previewOrApplyPlan(planResult.plan, { execution });
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(resolution, {
          subjectType: workspaceInstallSubjectType(args.type),
          sourceKind: "workspace",
        }),
      ),
    );
    yield* emitOperationResolution(args.command, resolution, {
      suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
    });
  });

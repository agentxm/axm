import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/client-core/unstable/cli-runtime";
import type { PlanResolution } from "@agentxm/client-core/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
import { makeInstallPlanExecutionMode } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import { InstallSkillCommandWorkflowActions } from "./command-actions.js";

export interface InstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly skills: readonly string[];
  readonly all: boolean;
}

export interface InstallSkillFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const appliedInstallHeadline = (resolution: PlanResolution, fallbackSource: string): string => {
  if (resolution._tag !== "ExecutedPlan") return `Installed skill ${fallbackSource}`;

  const successfulSteps = resolution.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      if (step.result.result !== "success") return [];
      return [{ label: step.label, agents: step.result.artifact?.agents }];
    });
  const firstStep = successfulSteps.at(0);

  if (successfulSteps.length === 1 && firstStep !== undefined) {
    const agents = firstStep.agents;
    const targetPhrase =
      agents === undefined || agents.length === 0
        ? ""
        : ` for ${count(agents.length, "agent target")}`;
    return `Installed skill ${firstStep.label}${targetPhrase}`;
  }

  if (successfulSteps.length > 1) {
    return `Installed ${count(successfulSteps.length, "skill")}`;
  }

  return `Installed skill ${fallbackSource}`;
};

const validateWorkspaceInstallArgs = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    if (args.all) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --all flag requires a source for skills install",
        recover: "Install all skills from a source, or omit `--all`",
        cmd: "axm skills install <source> --all",
      });
    }

    if (args.skills.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --skill flag requires a source for skills install",
        recover: "Install a named skill from a source, or omit `--skill`",
        cmd: "axm skills install <source> --skill <name>",
      });
    }
  });

export const handleInstall = (args: InstallHandlerArgs, flags: InstallSkillFlags) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      yield* validateWorkspaceInstallArgs(args);
      return yield* handleWorkspaceInstall({
        command: "skills.install",
        type: Option.some("skill"),
        planName: "Install configured skills",
        planDescription: Option.some("Install configured skills"),
        flags,
      });
    }

    const actions = yield* InstallSkillCommandWorkflowActions;
    const execution = yield* makeInstallPlanExecutionMode(
      flags,
      ["skills", "install"],
      [args.source.value],
      [
        recoverySwitch("--all", args.all),
        ...args.skills.map((skill) => recoveryOption("--skill", publicRecoveryValue(skill))),
      ],
    );
    const resolution = yield* runInstallCommandWorkflow(
      { source: args.source.value, skills: args.skills, all: args.all, force: flags.force },
      actions,
      { execution, displayApplied: false },
    );
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("skills.install", {
        planName: result.planName,
        ...(result.planDescription === undefined
          ? {}
          : { planDescription: result.planDescription }),
        message: "No skills installed.",
      });
      return;
    }

    yield* emitAppliedPlanOutcome({
      command: "skills.install",
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(resolution, "No skills installed.")
          : appliedInstallHeadline(resolution, args.source.value),
      resolution,
      reportInstallationCoverage: true,
      suggestions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
    });
  });

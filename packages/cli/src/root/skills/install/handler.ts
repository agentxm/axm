import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import { makeAppError } from "../../../app-error/index.js";
import {
  previewOrApplyPlan,
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/workspace-operations";
import {
  deriveOperationOutcome,
  operationPresentation,
  type JobStepResult,
  type Plan,
} from "@agentxm/workspace-operations";
import { runInstallCommandWorkflow } from "@agentxm/extension-lifecycle";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import { InstallSkillCommandWorkflowActions } from "./command-actions.js";
import { installBundledAxmSkill } from "../../setup.js";
import { workspaceAuthoredPath } from "../../shared/workspace-display-paths.js";
import { failureToStepFailure } from "../../../app-error/conversions.js";

export interface InstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly skills: readonly string[];
  readonly all: boolean;
  readonly bundled?: boolean;
}

export interface InstallSkillFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

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

const validateBundledInstallArgs = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source) || args.source.value !== "@agentxm/skills/axm") {
      return yield* makeAppError({
        code: "usage",
        detail: "The --bundled flag is restricted to @agentxm/skills/axm",
        recover: "Install the bundled official AXM skill",
        cmd: "axm skills install @agentxm/skills/axm --bundled",
      });
    }
    if (args.all || args.skills.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: "The --bundled flag cannot be combined with --all or --skill",
        recover: "Remove the source-selection flags and install the bundled AXM skill directly",
      });
    }
  });

export const validateInstallArgsBeforeWorkspace = (args: InstallHandlerArgs) =>
  args.bundled === true ? validateBundledInstallArgs(args) : Effect.void;

const handleBundledInstall = (flags: InstallSkillFlags) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const bundledInstaller = installBundledAxmSkill.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, ws),
          Layer.succeed(FileSystem.FileSystem, fs),
          Layer.succeed(Path.Path, path),
          Layer.succeed(CodingAgentRepository, agentRepo),
        ),
      ),
    );
    const plan: Plan = {
      _tag: "Plan",
      name: "Install bundled AXM skill",
      description: Option.some("Install the embedded compatible official AXM skill"),
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        "skill",
      ),
      failureSuggestions: [
        {
          description: "Preserve the authored skill and inspect executable compatibility guidance",
          cmd: "axm help upgrade",
        },
      ],
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "@agentxm/skills/axm",
              artifact: {
                path: workspaceAuthoredPath(path, ws, "skill", "axm"),
                scope: ws.scope,
                change: "updated",
              },
              run: bundledInstaller.pipe(
                Effect.mapError(failureToStepFailure),
                Effect.as({
                  result: "success",
                  message: "Installed the bundled AXM skill",
                  artifact: {
                    path: workspaceAuthoredPath(path, ws, "skill", "axm"),
                    scope: ws.scope,
                    change: "updated",
                  },
                } satisfies JobStepResult),
              ),
            },
          ],
        },
      ],
    };
    const execution = yield* makeInstallPlanExecution(
      flags,
      ["skills", "install"],
      ["@agentxm/skills/axm"],
      [recoverySwitch("--bundled", true)],
    );
    const resolution = yield* previewOrApplyPlan(plan, { execution });
    yield* emitOperationResolution("skills.install", resolution, {
      suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
    });
  });

type InstallSkillActions = Effect.Success<typeof InstallSkillCommandWorkflowActions>;

const handleInstallWithActionEffect = <R>(
  args: InstallHandlerArgs,
  flags: InstallSkillFlags,
  actionsEffect: Effect.Effect<InstallSkillActions, never, R>,
) =>
  withOperationLifecycle(
    {
      command: "skills.install",
      mode: flags.preview ? "preview" : "apply",
      planName: "Install skills",
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        "skill",
      ),
    },
    handleInstallBody(args, flags, actionsEffect),
  );

export const handleInstall = (args: InstallHandlerArgs, flags: InstallSkillFlags) =>
  handleInstallWithActionEffect(args, flags, InstallSkillCommandWorkflowActions);

export const handleInstallWithActions = (
  args: InstallHandlerArgs,
  flags: InstallSkillFlags,
  actions: InstallSkillActions,
) => handleInstallWithActionEffect(args, flags, Effect.succeed(actions));

const handleInstallBody = <R>(
  args: InstallHandlerArgs,
  flags: InstallSkillFlags,
  actionsEffect: Effect.Effect<InstallSkillActions, never, R>,
) =>
  Effect.gen(function* () {
    if (args.bundled === true) {
      yield* validateBundledInstallArgs(args);
      return yield* handleBundledInstall(flags);
    }

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

    const actions = yield* actionsEffect;
    const execution = yield* makeInstallPlanExecution(
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
      { execution },
    );
    if (deriveOperationOutcome(resolution) === "no-op" && resolution.units.length === 0) {
      const planDescription = Option.getOrUndefined(resolution.description);
      yield* emitNoOpOutcome("skills.install", {
        planName: resolution.name,
        ...(planDescription === undefined ? {} : { planDescription }),
        message: "No skills installed.",
      });
      return;
    }

    yield* emitOperationResolution("skills.install", resolution, {
      suggestions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
    });
  });

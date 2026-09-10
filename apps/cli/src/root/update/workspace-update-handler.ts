import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "../../cli-runtime/index.js";
import {
  previewOrApplyPlan,
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/workspace-operations";
import { operationPresentation } from "@agentxm/workspace-operations";

import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { buildWorkspaceUpdatePlan, type WorkspaceUpdatableType } from "./workspace-update.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import {
  makeInstallCommandActions,
  type InstallCommandActions,
} from "../shared/install-command-actions.js";
import { ReleaseAgePosture, withPublisherTrust } from "@agentxm/extension-lifecycle";

const workspaceUpdateSubjectType = (type: Option.Option<WorkspaceUpdatableType>): SubjectType =>
  Option.match(type, {
    onNone: () => "mixed" as const,
    onSome: (value) => value,
  });

export interface WorkspaceUpdateFlags {
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

export interface WorkspaceUpdateHandlerArgs {
  readonly command: string;
  readonly type: Option.Option<WorkspaceUpdatableType>;
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
  readonly flags: WorkspaceUpdateFlags;
  /** Installed names a selector resolved to; omit to update every entry. */
  readonly names?: ReadonlyArray<string>;
}

const handleWorkspaceUpdateWithActionEffect = <R>(
  args: WorkspaceUpdateHandlerArgs,
  actionsEffect: Effect.Effect<InstallCommandActions, never, R>,
) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.flags.preview ? "preview" : "apply",
      planName: args.planName,
      declaredAtomicity: "non-rollbackable",
      presentation: operationPresentation(
        { imperative: "update", past: "Updated", gerund: "Updating" },
        Option.getOrUndefined(args.type),
      ),
    },
    Effect.flatMap(actionsEffect, (actions) => handleWorkspaceUpdateBody(args, actions)),
  );

export const handleWorkspaceUpdate = (args: WorkspaceUpdateHandlerArgs) =>
  handleWorkspaceUpdateWithActionEffect(args, makeInstallCommandActions);

export const handleWorkspaceUpdateWithActions = (
  args: WorkspaceUpdateHandlerArgs,
  actions: InstallCommandActions,
) => handleWorkspaceUpdateWithActionEffect(args, Effect.succeed(actions));

const handleWorkspaceUpdateBody = (
  args: WorkspaceUpdateHandlerArgs,
  actions: InstallCommandActions,
) =>
  Effect.gen(function* () {
    const planResult = yield* buildWorkspaceUpdatePlan(
      {
        type: args.type,
        planName: args.planName,
        planDescription: args.planDescription,
        ...(args.names === undefined ? {} : { names: args.names }),
      },
      actions,
    );

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

    const nonConvergingNames = new Set(
      planResult.plan.jobs.flatMap((job) =>
        job.steps.flatMap((step) =>
          step.key?.startsWith("not-applicable:") === true ||
          step.key?.endsWith(":planning-error") === true
            ? [step.label]
            : [],
        ),
      ),
    );
    // Every Registry acceptance the collectors proposed is classified against
    // the accepted resolution, so a publisher change carries the same
    // interactive-only condition here as on the install workflow routes.
    const plan = yield* withPublisherTrust(planResult.plan);
    const execution = yield* makePlanExecution(
      { preview: args.flags.preview },
      makeConfirmationRecovery(workspaceUpdateCommand(args.type), [
        recoverySwitch("--refresh", args.flags.force === true),
        recoverySwitch("--ignore-release-age", (yield* ReleaseAgePosture) === "ignore"),
        ...(args.names ?? []).map((name) => recoveryOption("--name", publicRecoveryValue(name))),
      ]),
      [],
      Option.match(args.type, {
        onNone: () => [],
        onSome: (extensionType) =>
          [
            ...new Set(
              args.names ??
                planResult.plan.jobs.flatMap((job) =>
                  job.steps.map((step) => step.label.replace(/^(?:Skip|Update)\s+/u, "")),
                ),
            ),
          ]
            .filter((name) => !nonConvergingNames.has(name))
            .map((name) => ({ extensionType, name, plannedState: "enabled" as const })),
      }),
    );
    const resolution = yield* previewOrApplyPlan(plan, { execution });
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(resolution, {
          subjectType: workspaceUpdateSubjectType(args.type),
          sourceKind: "workspace",
        }),
      ),
    );
    yield* emitOperationResolution(args.command, resolution, {
      suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
    });
  });

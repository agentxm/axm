import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  UpdateExtensions,
  WORKSPACE_UPDATE_ATOMICITY,
  type ConfiguredUpdateSelector,
  type WorkspaceUpdatableType,
} from "@agentxm/extension-lifecycle";
import { ReleaseAgePosture } from "@agentxm/extension-resolution";
import {
  operationPresentation,
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/workspace-operations";

import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { extensionLifecycleFailedToAppError } from "../../feature-errors.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface WorkspaceUpdateFlags {
  readonly preview: boolean;
  readonly force?: boolean;
}

/** The route a person reruns to confirm this sweep. */
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
  /** A selector to narrow the sweep; omit to update every configured entry. */
  readonly selector?: ConfiguredUpdateSelector;
}

export const handleWorkspaceUpdate = (args: WorkspaceUpdateHandlerArgs) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.flags.preview ? "preview" : "apply",
      planName: args.planName,
      declaredAtomicity: WORKSPACE_UPDATE_ATOMICITY,
      presentation: operationPresentation(
        { imperative: "update", past: "Updated", gerund: "Updating" },
        Option.getOrUndefined(args.type),
      ),
    },
    handleWorkspaceUpdateBody(args).pipe(
      Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
        Effect.fail(extensionLifecycleFailedToAppError(failure)),
      ),
    ),
  );

const handleWorkspaceUpdateBody = Effect.fn("Update.handleConfigured")(function* (
  args: WorkspaceUpdateHandlerArgs,
) {
  const candidate = yield* UpdateExtensions.prepare({
    kind: "configured",
    type: args.type,
    planName: args.planName,
    planDescription: args.planDescription,
    nonInteractive: false,
    ...(args.selector === undefined ? {} : { selector: args.selector }),
  });

  if (candidate.outcome === "nothing-configured") {
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome({
        outcome: "no-op",
        subjectType: candidate.subjectType,
        sourceKind: "workspace",
      }),
    );
    yield* emitNoOpOutcome(args.command, {
      planName: args.planName,
      message: candidate.message,
      ...Option.match(candidate.planDescription, {
        onNone: () => ({}),
        onSome: (planDescription) => ({ planDescription }),
      }),
    });
    return;
  }

  const posture = yield* ReleaseAgePosture;
  const execution = yield* makePlanExecution(
    { preview: args.flags.preview },
    makeConfirmationRecovery(workspaceUpdateCommand(args.type), [
      recoverySwitch("--refresh", args.flags.force === true),
      recoverySwitch("--ignore-release-age", posture === "ignore"),
      ...(candidate.outcome === "planned" ? (candidate.selectedNames ?? []) : []).map((name) =>
        recoveryOption("--name", publicRecoveryValue(name)),
      ),
    ]),
  );
  const resolution = yield* UpdateExtensions.previewOrApply(candidate, execution);
  yield* setCommandSemanticProperties(
    summarizeCommandOutcome(
      operationResolutionSummary(resolution, {
        subjectType: candidate.subjectType,
        sourceKind: "workspace",
      }),
    ),
  );
  yield* emitOperationResolution(args.command, resolution, {
    suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
  });
});

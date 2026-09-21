import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  PACK_CONSTRAINT_CONFLICT_BLOCKER_ID,
  UpdateExtensions,
  WORKSPACE_UPDATE_ATOMICITY,
  type ConfiguredUpdateSelector,
  type WorkspaceUpdatableType,
} from "@agentxm/workspace/lifecycle";
import { ReleaseAgePosture } from "@agentxm/workspace/resolution";
import {
  operationPresentation,
  publicRecoveryValue,
  recoveryOption,
  recoverySwitch,
} from "@agentxm/workspace/transitions/planning";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { nameFromLabel } from "@agentxm/workspace/reconciliation";
import type { ResolvedUnit } from "@agentxm/workspace/transitions/planning";

import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import {
  emitOperationResolution,
  operationResolutionSummary,
  retryCanHelp,
} from "../../operation-output.js";
import { INSPECT_INSTALLED } from "../suggested-actions.js";
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

/**
 * What to type next when a sweep did not finish. Settled units are no-ops on a
 * rerun, so the emitting route is safe to repeat and is the one route that
 * covers every unsettled unit; the typed forms narrow it to the units that
 * are still waiting. Only a failure a retry can change is offered one — where
 * nothing a command does would help, the reasons stand on their own.
 */
const updateRecovery = (args: {
  readonly type: Option.Option<WorkspaceUpdatableType>;
  readonly unsettled: ReadonlyArray<ResolvedUnit<unknown>>;
  readonly refresh: boolean;
  readonly ignoreReleaseAge: boolean;
}): ReadonlyArray<SuggestedAction> => {
  if (!retryCanHelp(args.unsettled)) return [];
  const route = workspaceUpdateCommand(args.type);
  const flags = [
    ...(args.refresh ? ["--refresh"] : []),
    ...(args.ignoreReleaseAge ? ["--ignore-release-age"] : []),
  ];
  // The root route takes no `--name`, so it repeats the whole sweep; a typed
  // route names each unit that is still waiting.
  const names = Option.isNone(args.type)
    ? []
    : args.unsettled.flatMap((unit) => ["--name", nameFromLabel(unit.label)]);
  return [
    {
      description:
        args.unsettled.length === 1
          ? "Try the extension that did not update again"
          : "Try the extensions that did not update again",
      cmd: ["axm", ...route, ...flags, ...names].join(" "),
    },
  ];
};

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
      productActivity: { activity: "update", activationEligible: false },
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
  // A constraint contradiction is a choice to make, not a step to repeat:
  // point at the declarations that disagree instead of implying a rerun or a
  // sync would settle them.
  const constraintRefused = resolution.units.some(
    (unit) => unit.blocking?.reference === PACK_CONSTRAINT_CONFLICT_BLOCKER_ID,
  );
  yield* emitOperationResolution(args.command, resolution, {
    // Every other outcome offers a route only where one would settle it, so a
    // sweep that failed on something a rerun cannot fix names nothing here.
    suggestions: ({ unsettled }) => {
      if (constraintRefused) {
        return [
          {
            description:
              "Review the declarations that disagree, then widen or remove the declared range, or hold the Pack at a compatible version",
            cmd: "axm packs show <pack>",
          },
          INSPECT_INSTALLED,
        ];
      }
      if (unsettled.length === 0) return [INSPECT_INSTALLED];
      return updateRecovery({
        type: args.type,
        unsettled,
        refresh: args.flags.force === true,
        ignoreReleaseAge: posture === "ignore",
      });
    },
  });
});

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
import type { ConfirmationRecovery } from "@agentxm/workspace/transitions/planning";

import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import {
  emitNoOpOutcome,
  emitOperationResolution,
  operationResolutionSummary,
  retryCanHelp,
  type OperationRecoveryContext,
} from "../../operation-output.js";
import { INSPECT_INSTALLED } from "../suggested-actions.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
import { toAppError } from "../../app-error/conversions.js";
import {
  makeConfirmationRecovery,
  makePlanInvocation,
  narrowUpdateNames,
  retrySuggestion,
} from "../shared/confirmation-recovery.js";
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
    onSome: (value) => [EXTENSION_TYPE_PRESENTATION[value].route, "update"],
  });

/**
 * What the sweep offers next. A constraint contradiction is a choice to make,
 * not a step to repeat, so it names the declarations that disagree; a sweep
 * that settled everything offers only the inventory; and anything else offers
 * the invocation again only where a rerun would actually settle it, so a
 * failure no rerun can change names nothing here. Settled units are no-ops
 * on a rerun, so the invocation is safe to repeat; the root route takes no
 * `--name` and repeats the whole sweep, while a typed route is narrowed to
 * the units that are still waiting.
 */
export const updateSuggestions =
  (args: {
    readonly type: Option.Option<WorkspaceUpdatableType>;
    readonly recovery: ConfirmationRecovery;
    readonly constraintRefused: boolean;
  }) =>
  ({ unsettled }: OperationRecoveryContext): ReadonlyArray<SuggestedAction> => {
    if (args.constraintRefused) {
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
    if (!retryCanHelp(unsettled)) return [];
    return [
      retrySuggestion(
        unsettled.length === 1
          ? "Try the extension that did not update again"
          : "Try the extensions that did not update again",
        Option.isNone(args.type) ? args.recovery : narrowUpdateNames(args.recovery, unsettled),
      ),
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
      Effect.catchTag("ExtensionLifecycleFailed", (failure) => Effect.fail(toAppError(failure))),
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
    yield* emitNoOpOutcome({
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
  const { execution, recovery } = yield* makePlanInvocation(
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
  yield* emitOperationResolution(resolution, {
    recovery,
    suggestions: updateSuggestions({ type: args.type, recovery, constraintRefused }),
  });
});

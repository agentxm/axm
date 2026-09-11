/**
 * The command shell every `axm uninstall` route shares.
 *
 * The feature settles which extensions the selector names and resolves the
 * removal; this module turns flags into an execution intent, typed refusals
 * into the error envelope, and the outcome into the report a person reads —
 * including the no-op wording for a selector that matched nothing.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { UninstallExtensions, type UninstallExtensionsRequest } from "@agentxm/extension-lifecycle";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { deriveOperationOutcome, operationPresentation } from "@agentxm/workspace-operations";

import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import { lifecycleFailureToAppError } from "../../feature-errors.js";
import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { Screen, successDoc } from "../../screen/index.js";
import { makeUninstallPlanExecution } from "./confirmation-recovery.js";
import { emitNoOpOutcome } from "./no-op-output.js";
import { withOperationLifecycle } from "./operation-lifecycle.js";

export interface UninstallCommandArgs {
  /** Telemetry and machine-output command identity, e.g. `skills.uninstall`. */
  readonly command: string;
  readonly request: UninstallExtensionsRequest;
  /**
   * What the live frame calls this operation before planning settles which
   * extensions the selector names. The plan the feature settles carries its
   * own type-specific name, which is what the result document reports.
   */
  readonly liveName: string;
  readonly preview: boolean;
  /** The command words a confirmation-recovery line reproduces. */
  readonly recoveryCommand: ReadonlyArray<string>;
  /** What the person typed, reproduced as the recovery line's positional. */
  readonly recoveryPositionals: ReadonlyArray<string>;
  readonly suggestions: (type: InstallableExtensionType) => ReadonlyArray<SuggestedAction>;
  /**
   * What to say when the selector named nothing this command could remove. A
   * route that leaves this out reports the empty operation itself instead.
   */
  readonly noOpMessage?: (args: {
    readonly type: InstallableExtensionType;
    /**
     * The subject as the settled removal names it: the selector a typed
     * route was given, or the extension name the root form read out of the
     * registry FQN. A report names the same subject either way.
     */
    readonly selector: string;
    /** True when the named extensions were all already absent. */
    readonly alreadyAbsent: boolean;
  }) => string;
  /**
   * What a preview that found nothing to remove says when the machine-output
   * envelope did not already say it. Only the routes that report an empty
   * preview as a result rather than a no-op supply this.
   */
  readonly previewEmptyResult?: string;
}

const body = (args: UninstallCommandArgs) =>
  Effect.gen(function* () {
    const candidate = yield* UninstallExtensions.prepare(args.request).pipe(
      Effect.mapError(lifecycleFailureToAppError),
    );

    const execution = yield* makeUninstallPlanExecution(
      { preview: args.preview },
      args.recoveryCommand,
      args.recoveryPositionals,
    );
    const resolution = yield* UninstallExtensions.previewOrApply(candidate, execution).pipe(
      Effect.mapError(lifecycleFailureToAppError),
    );

    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(resolution, {
          subjectType: candidate.type,
          sourceKind: "registry",
        }),
      ),
    );

    if (
      args.previewEmptyResult !== undefined &&
      resolution.mode === "preview" &&
      resolution.units.length === 0
    ) {
      const { emitted } = yield* emitOperationResolution(args.command, resolution);
      if (!emitted) {
        const screen = yield* Screen;
        yield* screen.result(successDoc(args.previewEmptyResult));
      }
      return;
    }

    // A removal whose every unit found nothing to withdraw changed nothing,
    // even though the plan had units to run.
    const allUnitsAlreadyAbsent =
      candidate.empty ||
      (resolution.units.length > 0 && resolution.units.every((unit) => unit.state === "unchanged"));
    const noOpMessage = args.noOpMessage;
    if (
      noOpMessage !== undefined &&
      (deriveOperationOutcome(resolution) === "no-op" || allUnitsAlreadyAbsent)
    ) {
      yield* emitNoOpOutcome(args.command, {
        planName: resolution.name,
        message: noOpMessage({
          type: candidate.type,
          selector: candidate.selector,
          alreadyAbsent: allUnitsAlreadyAbsent,
        }),
      });
      return;
    }

    yield* emitOperationResolution(args.command, resolution, {
      suggestions: args.suggestions(candidate.type),
    });
  });

/** Run one uninstall route end to end. */
export const runUninstallCommand = (args: UninstallCommandArgs) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.preview ? "preview" : "apply",
      planName: args.liveName,
      presentation: operationPresentation(
        { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
        Option.getOrUndefined(args.request.type),
      ),
    },
    body(args),
  );

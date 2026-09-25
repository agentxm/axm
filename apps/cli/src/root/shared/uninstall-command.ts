/**
 * The command shell every `axm uninstall` route shares.
 *
 * The feature settles which extensions the selector names and resolves the
 * removal; this module turns flags into an execution intent, typed refusals
 * into the error envelope, and the outcome into the report a person reads —
 * including the no-op wording for a selector that matched nothing. The words
 * a type's report uses come from the per-type presentation table, so the
 * root form and the typed form of one removal read the same.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { UninstallExtensions, type UninstallExtensionsRequest } from "@agentxm/workspace/lifecycle";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { isGlobPattern } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import {
  deriveOperationOutcome,
  operationPresentation,
} from "@agentxm/workspace/transitions/planning";

import { setCommandSemanticProperties, summarizeCommandOutcome } from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import {
  emitOperationResolution,
  operationResolutionSummary,
  retryCanHelp,
} from "../../operation-output.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
import { makePublicPositionalPlanInvocation, retrySuggestion } from "./confirmation-recovery.js";
import { emitNoOpOutcome } from "./no-op-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface UninstallCommandArgs {
  /** Telemetry and machine-output command identity, e.g. `skills.uninstall`. */
  readonly command: string;
  readonly request: UninstallExtensionsRequest;
  readonly preview: boolean;
  /** The command words a confirmation-recovery line reproduces. */
  readonly recoveryCommand: ReadonlyArray<string>;
  /** What the person typed, reproduced as the recovery line's positional. */
  readonly recoveryPositionals: ReadonlyArray<string>;
}

/**
 * What the live frame calls the operation before planning settles which
 * extensions the selector names. The root route accepts every type, so it
 * names the operation generically; the plan the feature settles carries its
 * own type-specific name, which is what the result document reports.
 */
const liveName = (type: Option.Option<InstallableExtensionType>): string =>
  Option.match(type, {
    onNone: () => "Uninstall extension",
    onSome: (type) => `Uninstall ${EXTENSION_TYPE_PRESENTATION[type].noun.singular}`,
  });

/**
 * What a removal says when it withdrew nothing. A literal name that was
 * already absent is named; a glob is a pattern, not an extension, so a glob
 * that matched nothing says only that nothing was removed.
 */
const noOpMessage = (
  type: InstallableExtensionType,
  selector: string,
  alreadyAbsent: boolean,
): string => {
  const { plural } = EXTENSION_TYPE_PRESENTATION[type].noun;
  return alreadyAbsent && !isGlobPattern(selector)
    ? `No ${plural} uninstalled; ${selector} is not installed.`
    : `No ${plural} uninstalled.`;
};

const body = (args: UninstallCommandArgs) =>
  Effect.gen(function* () {
    const candidate = yield* UninstallExtensions.prepare(args.request).pipe(
      Effect.mapError(failureToAppError),
    );
    const { inspect } = EXTENSION_TYPE_PRESENTATION[candidate.type];

    const { execution, recovery } = yield* makePublicPositionalPlanInvocation(
      { preview: args.preview },
      args.recoveryCommand,
      args.recoveryPositionals,
    );
    const resolution = yield* UninstallExtensions.previewOrApply(candidate, execution).pipe(
      Effect.mapError(failureToAppError),
    );

    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(resolution, {
          subjectType: candidate.type,
          sourceKind: "registry",
        }),
      ),
    );

    // A removal whose every unit found nothing to withdraw changed nothing,
    // even though the plan had units to run.
    const allUnitsAlreadyAbsent =
      candidate.empty ||
      (resolution.units.length > 0 && resolution.units.every((unit) => unit.state === "unchanged"));
    if (deriveOperationOutcome(resolution) === "no-op" || allUnitsAlreadyAbsent) {
      // The registry FQN the person typed is not what a report calls the
      // extension: the settled removal names the same subject a typed route
      // would have named.
      yield* emitNoOpOutcome({
        planName: resolution.name,
        message: noOpMessage(candidate.type, candidate.selector, allUnitsAlreadyAbsent),
      });
      return;
    }

    yield* emitOperationResolution(resolution, {
      recovery,
      // An uninstall converges from the state the workspace is now in, so the
      // invocation the person typed is what tries the rest again.
      suggestions: ({ unsettled }) =>
        unsettled.length === 0 || !retryCanHelp(unsettled)
          ? [inspect]
          : [retrySuggestion("Try removing what is left again", recovery), inspect],
    });
  });

/** Run one uninstall route end to end. */
export const runUninstallCommand = (args: UninstallCommandArgs) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.preview ? "preview" : "apply",
      planName: liveName(args.request.type),
      presentation: operationPresentation(
        { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
        Option.getOrUndefined(args.request.type),
      ),
    },
    body(args),
  );

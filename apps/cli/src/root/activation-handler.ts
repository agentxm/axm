/**
 * The one handler behind `<type> enable` and `<type> disable` for every
 * extension type: parse the request, settle it through the lifecycle
 * feature's activation use case, preview or apply it, and render the outcome.
 *
 * Whatever the outcome, the next step a reader is offered starts with the
 * type's own inspection command from the presentation table: after a change,
 * beside a no-op that named nothing to change, and on a refusal that found
 * the named subject missing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import { SetActivation, type SetActivationRequest } from "@agentxm/workspace/lifecycle";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { makeAppError, type AppError } from "../app-error/index.js";
import { failureToAppError } from "../app-error/conversions.js";
import { emitOperationResolution } from "../operation-output.js";
import { EXTENSION_TYPE_PRESENTATION } from "./extension-type-presentation.js";
import { makePublicPositionalPlanExecution } from "./shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "./shared/no-op-output.js";
import { withOperationLifecycle } from "../operation-lifecycle.js";

export interface ActivationCommandArgs extends SetActivationRequest {
  readonly preview: boolean;
}

export interface ActivationCommandPresentation {
  /** The machine-output command identity, such as `skills.enable`. */
  readonly command: string;
  /** The command path an approval-recovery hint reprints. */
  readonly commandPath: ReadonlyArray<string>;
  readonly planName: string;
  /** What a settled change offers after the type's inspection command. */
  readonly suggestions: ReadonlyArray<SuggestedAction>;
}

export const handleSetActivation = (
  args: ActivationCommandArgs,
  presentation: ActivationCommandPresentation,
) =>
  withOperationLifecycle(
    {
      command: presentation.command,
      mode: args.preview ? "preview" : "apply",
      planName: presentation.planName,
      productActivity: { activity: "configure", activationEligible: args.enabled },
    },
    handleSetActivationBody(args, presentation),
  );

/**
 * A refusal that found no such subject is answered with the command that
 * lists what the workspace does hold; every other refusal stands as the
 * feature rendered it.
 */
const withInspection = (error: AppError, inspect: SuggestedAction): AppError =>
  error.code === "not_found"
    ? makeAppError({
        code: error.code,
        title: error.title,
        detail: error.detail,
        suggestions: [...(error.suggestions ?? []), inspect],
        cause: error.cause,
      })
    : error;

const handleSetActivationBody = Effect.fn("SetActivation.handle")(function* (
  args: ActivationCommandArgs,
  presentation: ActivationCommandPresentation,
) {
  const { inspect } = EXTENSION_TYPE_PRESENTATION[args.type];
  const candidate = yield* SetActivation.prepare({
    type: args.type,
    name: args.name,
    enabled: args.enabled,
  }).pipe(Effect.mapError((failure) => withInspection(failureToAppError(failure), inspect)));

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome(presentation.command, {
      planName: presentation.planName,
      planDescription: `${args.enabled ? "Enable" : "Disable"} ${candidate.name}`,
      message: candidate.message,
      suggestions: [inspect],
    });
    return;
  }

  const execution = yield* makePublicPositionalPlanExecution(args, presentation.commandPath, [
    candidate.name,
  ]);
  const resolution = yield* SetActivation.previewOrApply(candidate, execution).pipe(
    Effect.mapError(failureToAppError),
  );
  yield* emitOperationResolution(presentation.command, resolution, {
    suggestions: [inspect, ...presentation.suggestions],
  });
});

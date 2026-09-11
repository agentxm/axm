/**
 * The one handler behind `<type> enable` and `<type> disable` for every
 * extension type: parse the request, settle it through the lifecycle
 * feature's activation use case, preview or apply it, and render the outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import { SetActivation, type SetActivationRequest } from "@agentxm/extension-lifecycle";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { lifecycleFailureToAppError } from "../feature-errors.js";
import { emitOperationResolution } from "../operation-output.js";
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
    },
    handleSetActivationBody(args, presentation),
  );

const handleSetActivationBody = Effect.fn("SetActivation.handle")(function* (
  args: ActivationCommandArgs,
  presentation: ActivationCommandPresentation,
) {
  const candidate = yield* SetActivation.prepare({
    type: args.type,
    name: args.name,
    enabled: args.enabled,
  }).pipe(Effect.mapError(lifecycleFailureToAppError));

  if (candidate._tag === "Unchanged") {
    yield* emitNoOpOutcome(presentation.command, {
      planName: presentation.planName,
      planDescription: `${args.enabled ? "Enable" : "Disable"} ${candidate.name}`,
      message: candidate.message,
    });
    return;
  }

  const execution = yield* makePublicPositionalPlanExecution(args, presentation.commandPath, [
    candidate.name,
  ]);
  const resolution = yield* SetActivation.previewOrApply(candidate, execution).pipe(
    Effect.mapError(lifecycleFailureToAppError),
  );
  yield* emitOperationResolution(presentation.command, resolution, {
    suggestions: presentation.suggestions,
  });
});

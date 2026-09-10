/**
 * The command shell every `axm <type> new` route shares.
 *
 * The feature settles the creation and resolves it; this module does what a
 * transport does — turn typed refusals into the error envelope, turn command
 * flags into an execution intent, and render the outcome with the next step
 * an author takes.
 */

import * as Effect from "effect/Effect";

import {
  CreateExtension,
  createExtensionPlanName,
  type CreateExtensionCandidate,
  type CreateExtensionRequest,
} from "@agentxm/extension-authoring";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { authoringFailureToAppError } from "../../feature-errors.js";
import { emitOperationResolution } from "../../operation-output.js";
import { makePlanExecution } from "./confirmation-recovery.js";
import { withOperationLifecycle } from "./operation-lifecycle.js";

export interface CreateExtensionCommandArgs {
  /** Telemetry and machine-output command identity, e.g. `skills.new`. */
  readonly command: string;
  readonly request: CreateExtensionRequest;
  readonly preview: boolean;
  /** What the author does next, rendered from the settled creation. */
  readonly suggestions: (candidate: CreateExtensionCandidate) => ReadonlyArray<SuggestedAction>;
}

const body = (args: CreateExtensionCommandArgs) =>
  Effect.gen(function* () {
    const candidate = yield* CreateExtension.prepare(args.request).pipe(
      Effect.mapError(authoringFailureToAppError),
    );
    const execution = yield* makePlanExecution(
      { preview: args.preview },
      { command: [], arguments: [] },
    );
    const resolution = yield* CreateExtension.previewOrApply(candidate, execution).pipe(
      Effect.mapError(authoringFailureToAppError),
    );
    yield* emitOperationResolution(args.command, resolution, {
      suggestions: args.suggestions(candidate),
    });
  });

/** Run one `<type> new` route end to end. */
export const runCreateExtensionCommand = (args: CreateExtensionCommandArgs) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.preview ? "preview" : "apply",
      planName: createExtensionPlanName(args.request.type),
    },
    body(args),
  );

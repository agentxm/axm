import * as Effect from "effect/Effect";

import { PromoteAuthoredPack } from "@agentxm/extension-lifecycle";

import { emitOperationResolution } from "../../../operation-output.js";
import { extensionLifecycleFailedToAppError } from "../../../feature-errors.js";
import { makePublicPositionalPlanExecution } from "../../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";

export interface UnpackHandlerArgs {
  readonly name: string;
  readonly preview: boolean;
}

/**
 * `axm packs unpack`: promote every member the named Pack contributed to a
 * direct declaration, then remove the Pack.
 */
export const handleUnpack = (args: UnpackHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "packs.unpack",
      mode: args.preview ? "preview" : "apply",
      planName: "Unpack pack",
    },
    handleUnpackBody(args).pipe(
      Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
        Effect.fail(extensionLifecycleFailedToAppError(failure)),
      ),
    ),
  );

const handleUnpackBody = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const candidate = yield* PromoteAuthoredPack.prepare({ name: args.name });
  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["packs", "unpack"],
    [args.name],
  );
  const resolution = yield* PromoteAuthoredPack.previewOrApply(candidate, execution);
  yield* emitOperationResolution("packs.unpack", resolution);
});

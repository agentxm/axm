import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { resolutionBatches } from "./resolution-batches.js";
import {
  ExactContentRequestSchema,
  type ExactContentRequest,
} from "@agentxm/registry-protocol/unstable/registry/resolutions";
import type { ValidateExtensionAccessArgs } from "./client.js";
import { RegistryRequestFailed } from "./errors.js";

/** Split one logical admission without changing its opaque, input-correlated keys. */
export const exactContentBatches = Effect.fnUntraced(function* (
  args: ReadonlyArray<ValidateExtensionAccessArgs>,
) {
  const batches = yield* resolutionBatches(
    args.map((arg, index) => ({
      key: String(index),
      identity: { owner: arg.owner, type: arg.type, name: arg.name },
      expectedPublisherBinding: arg.exact.publisherBindingId,
      accepted: { version: arg.exact.version, integrity: arg.exact.integrity },
    })),
    (items): ExactContentRequest => ({ schemaVersion: 2, purpose: "authorize-exact", items }),
  );
  return yield* Effect.forEach(batches, (batch) =>
    Schema.decodeUnknownEffect(ExactContentRequestSchema)(batch, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError(
        (cause) =>
          new RegistryRequestFailed({
            category: "validation",
            detail: "Invalid exact-content request.",
            cause,
          }),
      ),
    ),
  );
});

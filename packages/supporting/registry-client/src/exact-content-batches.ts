import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MAX_RESOLUTION_ITEMS,
  MAX_RESOLUTION_REQUEST_BYTES,
} from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
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
  const batches: ExactContentRequest[] = [];
  let items: ExactContentRequest["items"][number][] = [];
  const encoder = new TextEncoder();
  const envelope = (batch: ExactContentRequest["items"]) => ({
    schemaVersion: 2 as const,
    purpose: "authorize-exact" as const,
    items: batch,
  });
  for (const [index, arg] of args.entries()) {
    const item = {
      key: String(index),
      identity: { owner: arg.owner, type: arg.type, name: arg.name },
      expectedPublisherBinding: arg.exact.publisherBindingId,
      accepted: { version: arg.exact.version, integrity: arg.exact.integrity },
    };
    const candidate = [...items, item];
    if (
      candidate.length > MAX_RESOLUTION_ITEMS ||
      encoder.encode(JSON.stringify(envelope(candidate))).byteLength > MAX_RESOLUTION_REQUEST_BYTES
    ) {
      if (items.length > 0) batches.push(envelope(items));
      items = [];
      if (
        encoder.encode(JSON.stringify(envelope([item]))).byteLength > MAX_RESOLUTION_REQUEST_BYTES
      )
        return yield* new RegistryRequestFailed({
          category: "validation",
          detail: "An exact-content item exceeds the request byte limit.",
        });
    }
    items.push(item);
  }
  if (items.length > 0) batches.push(envelope(items));
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

import * as Effect from "effect/Effect";
import {
  MAX_RESOLUTION_ITEMS,
  MAX_RESOLUTION_REQUEST_BYTES,
} from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { RegistryRequestFailed } from "./errors.js";

/** Logical submissions are bounded at the encoded transport envelope, not at callers. */
export const resolutionBatches = <A, B>(
  items: ReadonlyArray<A>,
  envelope: (items: ReadonlyArray<A>) => B,
) =>
  Effect.gen(function* () {
    const encoder = new TextEncoder();
    const batches: B[] = [];
    let current: A[] = [];
    const fits = (batch: ReadonlyArray<A>) =>
      batch.length <= MAX_RESOLUTION_ITEMS &&
      encoder.encode(JSON.stringify(envelope(batch))).byteLength <= MAX_RESOLUTION_REQUEST_BYTES;
    for (const item of items) {
      if (!fits([...current, item])) {
        if (current.length > 0) batches.push(envelope(current));
        current = [];
        if (!fits([item]))
          return yield* new RegistryRequestFailed({
            category: "validation",
            detail: "A resolution item exceeds the request byte limit.",
          });
      }
      current.push(item);
    }
    if (current.length > 0) batches.push(envelope(current));
    return batches;
  });

/**
 * SHA-256 checksum utility.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { createHash } from "node:crypto";

/** Compute SHA-256 checksum in `sha256:<hex>` format. */
export const computeChecksum = (data: Uint8Array): Effect.Effect<string> =>
  Effect.sync(() => {
    const hex = createHash("sha256").update(data).digest("hex");
    return `sha256:${hex}`;
  });

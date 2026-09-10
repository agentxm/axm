/**
 * SHA-512 integrity utility.
 *
 * Deliberately duplicated from the CLI-destined integrity module: the
 * integration may not depend on application utilities, and this helper is
 * within the sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { createHash } from "node:crypto";

/** Compute SHA-512 integrity in `sha512-<base64>` SRI format. */
export const computeIntegrity = (data: Uint8Array): Effect.Effect<string> =>
  Effect.sync(() => {
    const base64 = createHash("sha512").update(data).digest("base64");
    return `sha512-${base64}`;
  });

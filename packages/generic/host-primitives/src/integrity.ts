/** SHA-512 SRI digests shared by AXM host operations. */

// Intentional escape hatch: node:crypto provides the host's SHA-512 implementation.
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";

/** Compute a SHA-512 integrity string in `sha512-<base64>` format. */
export const sha512Integrity = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

/** Effect form for callers already composing host operations. */
export const computeIntegrity = (bytes: Uint8Array): Effect.Effect<string> =>
  Effect.sync(() => sha512Integrity(bytes));

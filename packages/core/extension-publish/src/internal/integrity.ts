/**
 * Subresource-integrity digest for a built archive. The value the Registry
 * stores and every later verification compares against.
 */

import { createHash } from "node:crypto";

export const computeIntegrity = (data: Uint8Array): string =>
  `sha512-${createHash("sha512").update(data).digest("base64")}`;

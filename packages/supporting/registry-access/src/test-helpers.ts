/**
 * Decoding helpers for registry-access internal tests. Test support only —
 * excluded from the package build and never part of the public API.
 */

import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";

export const handle = (value: string): Handle => decodeHandleSync(value);

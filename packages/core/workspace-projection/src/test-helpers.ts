/** Shared decode helpers for workspace-projection tests. */

import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";

export const handle = (value: string): Handle => decodeHandleSync(value);

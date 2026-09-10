/** Shared decode helpers for agent-integration tests. */

import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";

export const handle = (value: string): Handle => decodeHandleSync(value);

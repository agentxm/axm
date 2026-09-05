/**
 * Decoding helpers for registry-auth internal tests. Test support only —
 * excluded from the package build and never part of the public API.
 */

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

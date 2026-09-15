/** Test-only decoding helpers and failure wording for this package's tests. */
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { ExtensionResolutionFailed } from "./errors.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

/**
 * Render a failure as the sentence the structural test adapter reports.
 * Assertions in this package bind to this mapping, not to the application
 * boundary's wording.
 */
export const describeTestFailure = (failure: unknown): string => {
  if (failure instanceof ExtensionResolutionFailed) return failure.detail ?? failure.category;
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("cause" in failure && failure.cause !== undefined && failure.cause !== failure) {
      return describeTestFailure(failure.cause);
    }
  }
  return String(failure);
};

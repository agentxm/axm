/**
 * Shared helpers for extension-authoring internal tests: decode shortcuts
 * and a structural serialization of a failure for operation tests.
 */

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
} from "./authored-package-errors.js";
import { CreateDestinationExists } from "@agentxm/extension-materialization";
import { StepFailure } from "@agentxm/workspace-operations";
import { AuthoringFailed } from "./errors.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

/** Render a failure as the sentence the structural test adapter reports. */
export const describeTestFailure = (failure: unknown): string => {
  if (failure instanceof AuthoringFailed) return failure.detail;
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

/**
 * Structural serialization used where a test asserts on a step result rather
 * than on the feature's own wording: the feature's failure maps 1:1, the
 * create-preflight family keeps its category, and anything else keeps its
 * detail sentence under an `internal` category.
 */
export const testFailureToStepFailure = (failure: unknown): StepFailure => {
  if (failure instanceof AuthoringFailed) {
    return new StepFailure({
      category: failure.category,
      detail: failure.detail,
      ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    });
  }
  if (failure instanceof CreateDestinationExists || failure instanceof CreateNameConfigured) {
    return new StepFailure({
      category: "conflict",
      detail: describeTestFailure(failure),
      cause: failure,
    });
  }
  if (failure instanceof CreateDestinationInspectionFailed) {
    return new StepFailure({
      category: "internal",
      detail: describeTestFailure(failure),
      cause: failure,
    });
  }
  return new StepFailure({
    category: "internal",
    detail: describeTestFailure(failure),
    cause: failure,
  });
};

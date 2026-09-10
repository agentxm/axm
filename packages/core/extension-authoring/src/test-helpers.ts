/**
 * Shared helpers for extension-authoring internal tests: decode shortcuts
 * and a structural failure adapter for operation tests.
 */

import * as Layer from "effect/Layer";
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  CreateDestinationExists,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
} from "@agentxm/extension-workspace";
import { StepFailure } from "@agentxm/workspace-operations";
import { AuthoringFailed } from "./errors.js";
import { AuthoringFailureAdapter } from "./failure-adapter.js";

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
 * Structural stand-in for the application's failure adapter: the feature's
 * own failure maps 1:1, the create-preflight kernel family keeps its
 * boundary category, and anything else keeps its detail sentence under an
 * `internal` category. Assertions in this package bind to this mapping, not
 * to the application boundary's wording.
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

export const TestAuthoringFailureAdapter = Layer.succeed(AuthoringFailureAdapter, {
  toStepFailure: testFailureToStepFailure,
});

/**
 * Deterministic step-failure conversion for consumer specifications and tests.
 *
 * The conversion carries a failure's own rendering data rather than the
 * kernel's wording, so an example asserts on its producer's sentence and not
 * on the kernel's rendering of it. Production source never imports this
 * module.
 *
 * @experimental This API is unstable and may change without notice.
 */
import * as Layer from "effect/Layer";

import {
  ExtensionLifecycleFailed,
  OPERATION_ERROR_CATEGORIES,
  StepFailure,
  makeStepFailure,
  type OperationErrorCategory,
} from "../operations/index.js";
import type { KernelFailure } from "./failure-rendering.js";
import { StepFailureConversion } from "./step-failure-conversion.js";

const isCategory = (value: unknown): value is OperationErrorCategory =>
  typeof value === "string" &&
  OPERATION_ERROR_CATEGORIES.some((category): boolean => category === value);

/** The first sentence a failure or one of its causes carries, else its string form. */
const describeFailure = (failure: unknown): string => {
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("cause" in failure && failure.cause !== undefined && failure.cause !== failure) {
      return describeFailure(failure.cause);
    }
  }
  return String(failure);
};

/**
 * The refusal an operation settles with maps one-to-one, every carried field
 * included; any other failure keeps its own category (or `internal` when it
 * names none) and its own sentence.
 */
const toTestStepFailure = (failure: KernelFailure): StepFailure => {
  if (failure instanceof ExtensionLifecycleFailed) {
    return makeStepFailure({
      category: failure.category,
      title: failure.title,
      detail: failure.detail,
      metadata: failure.metadata,
      retryable: failure.retryable,
      recover: failure.recover,
      cmd: failure.cmd,
      suggestions: failure.suggestions,
      cause: failure.cause,
    });
  }
  const category: unknown = "category" in failure ? failure.category : undefined;
  return new StepFailure({
    category: isCategory(category) ? category : "internal",
    detail: describeFailure(failure),
    cause: failure,
  });
};

/** The step-failure conversion, bound to the structural rendering above. */
export const StepFailureConversionTest: Layer.Layer<StepFailureConversion> = Layer.succeed(
  StepFailureConversion,
  { toStepFailure: toTestStepFailure },
);

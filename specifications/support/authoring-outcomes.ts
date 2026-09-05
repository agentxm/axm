import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { expect } from "vitest";
import { getAppError, PlanResolutionDocumentSchema } from "axm.sh/specification-harness";

/** A refusal can be raised before planning or reported by an assessed operation. */
export const expectAuthoringRefusal = (
  outcome: Result.Result<unknown, unknown>,
  document: unknown,
  code: string,
): void => {
  if (Result.isFailure(outcome)) {
    expect(getAppError(outcome.failure).code).toBe(code);
    return;
  }
  const decoded = Schema.decodeUnknownSync(PlanResolutionDocumentSchema)(document);
  expect(decoded.result.outcome).toBe("failed");
  expect(decoded.result.failure?.code).toBe(code);
};

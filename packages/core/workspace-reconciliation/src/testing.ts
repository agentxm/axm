/** Deterministic reconciliation failure conversion for consumer specifications. */
import { StepFailure } from "@agentxm/workspace-operations";
import { makeReconciliationLayer } from "./layer.js";
export const ReconciliationFailureConversionTest = makeReconciliationLayer({
  toStepFailure: (cause) =>
    new StepFailure({
      category: "internal",
      detail: "detail" in cause && typeof cause.detail === "string" ? cause.detail : String(cause),
      cause,
    }),
});

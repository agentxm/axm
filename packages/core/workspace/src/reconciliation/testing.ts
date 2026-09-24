/** Deterministic reconciliation failure conversion for consumer specifications. */
import * as Layer from "effect/Layer";

import { StepFailure } from "../transitions/planning/index.js";
import { SyncStepFailureConversion } from "./failure-adapter.js";

export const ReconciliationFailureConversionTest = Layer.succeed(SyncStepFailureConversion, {
  toStepFailure: (cause) =>
    new StepFailure({
      category: "internal",
      detail: "detail" in cause && typeof cause.detail === "string" ? cause.detail : String(cause),
      cause,
    }),
});

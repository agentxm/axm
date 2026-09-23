import * as Layer from "effect/Layer";

import { SyncStepFailureConversion } from "./failure-adapter.js";
import { workspaceFailureToStepFailure } from "./failure-rendering.js";

/**
 * The kernel's reconciliation failure conversion; workspace and manager
 * lifetimes remain in `R`.
 */
export const ReconciliationFailureConversionLive = Layer.succeed(SyncStepFailureConversion, {
  toStepFailure: (failure) => workspaceFailureToStepFailure(failure),
});

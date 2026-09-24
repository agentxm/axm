import * as Layer from "effect/Layer";

import { SyncStepFailureConversion, type SyncFailureAdapter } from "./failure-adapter.js";
import { workspaceFailureToStepFailure } from "./failure-rendering.js";

/**
 * The kernel's conversion of a sync policy failure: the workspace failure
 * rendering, so a failure inside a reconciliation closure reads exactly as it
 * does at a command boundary. Closures a feature builds outside the sync
 * planners pass this same value; none renders on its own.
 */
export const syncFailureRendering: SyncFailureAdapter = {
  toStepFailure: (failure) => workspaceFailureToStepFailure(failure),
};

/**
 * The kernel's reconciliation failure conversion; workspace and manager
 * lifetimes remain in `R`.
 */
export const ReconciliationFailureConversionLive = Layer.succeed(
  SyncStepFailureConversion,
  syncFailureRendering,
);

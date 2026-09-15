import * as Layer from "effect/Layer";
import { SyncStepFailureConversion, type SyncFailureAdapter } from "./failure-adapter.js";

/** Application-owned error conversion; workspace and manager lifetimes remain in R. */
export const makeReconciliationLayer = (adapter: SyncFailureAdapter) =>
  Layer.succeed(SyncStepFailureConversion, adapter);

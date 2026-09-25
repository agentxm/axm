/**
 * The conversion from reconciliation's typed failures to the kernel's
 * `StepFailure`, as a service reconciliation planners keep in `R`.
 *
 * The kernel owns the rendering and supplies the implementation as
 * `ReconciliationFailureConversionLive`, so step categories and details
 * inside sync plans read the same as the command boundary's rendering of the
 * same failure. Planners keep the requirement as a service in `R` rather than
 * as an argument threaded through every call — a conversion is a capability
 * provided once per invocation, not a decision each call site makes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

import type { ExtensionManagerFailure } from "../materialization/index.js";
import type {
  ExtensionResolutionFailed,
  PackDependencyResolutionFailure,
  SourceAuthorityBlocked,
} from "../resolution/index.js";
import type { SourceResolutionFailure } from "../resolution/sources/index.js";
import type { AcceptedCanonicalRefError } from "../desired-state/index.js";
import type { InstructionMaintenanceFailure } from "../projection/index.js";
import type { NativeFormatFailure } from "../projection/agent-adapters/index.js";
import type {
  WorkspaceTransactionFailure,
  WorkspaceRestorationIncomplete,
} from "../transitions/settlement/index.js";
import type { StepFailure } from "../transitions/planning/index.js";
import type { WorkspaceSyncCleanupFailure } from "./errors.js";

/** Every typed failure the sync policy hands to the conversion. */
export type SyncPolicyFailure =
  | WorkspaceTransactionFailure
  | WorkspaceRestorationIncomplete
  | AcceptedCanonicalRefError
  | ExtensionManagerFailure
  | ExtensionResolutionFailed
  | InstructionMaintenanceFailure
  | NativeFormatFailure
  | PackDependencyResolutionFailure
  | SourceAuthorityBlocked
  | SourceResolutionFailure
  | WorkspaceSyncCleanupFailure;

export interface SyncFailureAdapter {
  readonly toStepFailure: (failure: SyncPolicyFailure) => StepFailure;
}

/** The conversion, provided once per invocation. */
export class SyncStepFailureConversion extends ServiceMap.Service<
  SyncStepFailureConversion,
  SyncFailureAdapter
>()("@agentxm/workspace/reconciliation/SyncStepFailureConversion") {}

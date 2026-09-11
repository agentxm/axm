/**
 * The application-supplied conversion from this feature's typed failures to
 * the kernel's `StepFailure`.
 *
 * Error rendering is application-owned: the CLI implements this with the same
 * dispatcher it uses at its output boundary, so step categories and details
 * inside sync plans stay byte-identical with rendered errors. The feature
 * keeps only the requirement, never the mapping, and it keeps it as a service
 * in `R` rather than as an argument threaded through every planner — a
 * conversion is a capability the application provides once, not a decision
 * each call site makes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

import type { ExtensionManagerFailure } from "@agentxm/extension-materialization";
import type {
  ExtensionResolutionFailed,
  PackDependencyResolutionFailure,
  SourceAuthorityBlocked,
} from "@agentxm/extension-resolution";
import type { SourceResolutionFailure } from "@agentxm/extension-sources";
import type { AcceptedCanonicalRefError } from "@agentxm/workspace-state";
import type { InstructionMaintenanceFailure } from "@agentxm/workspace-projection";
import type { McpConfigSyncFailure } from "@agentxm/agent-integration";
import type { StepFailure } from "@agentxm/workspace-operations";
import type { WorkspaceSyncCleanupFailure } from "./errors.js";

/** Every typed failure the sync policy hands to the application's converter. */
export type SyncPolicyFailure =
  | AcceptedCanonicalRefError
  | ExtensionManagerFailure
  | ExtensionResolutionFailed
  | InstructionMaintenanceFailure
  | McpConfigSyncFailure
  | PackDependencyResolutionFailure
  | SourceAuthorityBlocked
  | SourceResolutionFailure
  | WorkspaceSyncCleanupFailure;

export interface SyncFailureAdapter {
  readonly toStepFailure: (failure: SyncPolicyFailure) => StepFailure;
}

/** The conversion, as the application provides it once per invocation. */
export class SyncStepFailureConversion extends ServiceMap.Service<
  SyncStepFailureConversion,
  SyncFailureAdapter
>()("@agentxm/workspace-sync/SyncStepFailureConversion") {}

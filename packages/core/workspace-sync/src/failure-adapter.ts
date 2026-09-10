/**
 * The application-supplied conversion from typed failures to the kernel's
 * `StepFailure`. Error rendering is application-owned: the CLI implements this
 * with the same dispatcher it uses at its output boundary, so step categories
 * and details inside sync plans stay byte-identical with rendered errors. The
 * feature keeps only the requirement, never the mapping.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  ExtensionManagerFailure,
  InstructionMaintenanceFailure,
  McpConfigSyncFailure,
} from "@agentxm/extension-workspace";
import type { StepFailure } from "@agentxm/workspace-operations";
import type { WorkspaceSyncCleanupFailure } from "./errors.js";

/** Every typed failure the sync policy hands to the application's converter. */
export type SyncPolicyFailure =
  | ExtensionManagerFailure
  | InstructionMaintenanceFailure
  | McpConfigSyncFailure
  | WorkspaceSyncCleanupFailure;

export interface SyncFailureAdapter {
  readonly toStepFailure: (failure: SyncPolicyFailure) => StepFailure;
}

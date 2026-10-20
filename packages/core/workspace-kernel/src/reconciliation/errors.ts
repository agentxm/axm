/**
 * Typed failures for workspace reconciliation. A reconciliation policy step
 * refuses with the kernel's operation refusal under the sync family's
 * diagnostic kind; the producer owns the category choice and user-facing
 * wording, and the application boundary converts the carried fields into its
 * error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Config from "effect/Config";
import type { NativeLocationError } from "../locations/index.js";
import type { ExtensionManagerFailure } from "../materialization/index.js";
import { refusalOf, type OperationRefused } from "../operations/index.js";
import type { NativeFormatFailure } from "../agent-adapters/index.js";
import type { InstructionMaintenanceFailure } from "../projection/index.js";
import type { AcceptedCanonicalRefError } from "../workspace-state/index.js";
import type {
  ExtensionResolutionFailed,
  PackDependencyResolutionFailure,
  SourceAuthorityBlocked,
} from "../resolution/index.js";
import type { SourceResolutionFailure } from "../sources/index.js";
import type {
  WorkspaceTransactionFailure,
  WorkspaceRestorationIncomplete,
} from "../settlement/index.js";

/** Refuse a workspace reconciliation policy step with the category and sentence it decided. */
export const syncRefused = refusalOf({
  kind: "workspace-sync-failed",
  operation: "workspace.operation",
});

/** Every failure the rendered-file cleanup sweep surfaces. */
export type WorkspaceSyncCleanupFailure =
  OperationRefused | ExtensionManagerFailure | NativeFormatFailure | Config.ConfigError;

/** Every typed failure the sync policy surfaces. */
export type SyncPolicyFailure =
  | NativeLocationError
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

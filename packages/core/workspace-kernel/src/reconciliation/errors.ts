/**
 * Typed failures for workspace reconciliation. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Config from "effect/Config";
import type { NativeLocationError } from "../locations/index.js";
import * as Schema from "effect/Schema";
import type { ExtensionManagerFailure } from "../materialization/index.js";
import { FailureSuggestedActionSchema, ErrorCodeSchema } from "../operations/index.js";
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

/**
 * A workspace reconciliation policy step could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceSyncFailed extends Schema.TaggedError<WorkspaceSyncFailed>()(
  "WorkspaceSyncFailed",
  {
    category: ErrorCodeSchema,
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** Every failure the rendered-file cleanup sweep surfaces. */
export type WorkspaceSyncCleanupFailure =
  WorkspaceSyncFailed | ExtensionManagerFailure | NativeFormatFailure | Config.ConfigError;

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

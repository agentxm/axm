/**
 * Typed failures for workspace-sync reconciliation. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import type { ExtensionManagerFailure, McpConfigSyncFailure } from "@agentxm/extension-workspace";

const CarriedSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/**
 * A workspace-sync policy step could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceSyncFailed extends Schema.TaggedError<WorkspaceSyncFailed>()(
  "WorkspaceSyncFailed",
  {
    category: Schema.Literals(["conflict", "internal", "not_found", "validation"]),
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** Every failure the rendered-file cleanup sweep surfaces. */
export type WorkspaceSyncCleanupFailure =
  WorkspaceSyncFailed | ExtensionManagerFailure | McpConfigSyncFailure;

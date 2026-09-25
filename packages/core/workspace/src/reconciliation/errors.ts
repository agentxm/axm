/**
 * Typed failures for workspace reconciliation. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Config from "effect/Config";
import * as Schema from "effect/Schema";
import type { ExtensionManagerFailure } from "../materialization/index.js";
import {
  FailureSuggestedActionSchema,
  OperationErrorCategorySchema,
} from "../transitions/planning/plan/errors.js";
import type { NativeFormatFailure } from "../projection/agent-adapters/index.js";

/**
 * A workspace reconciliation policy step could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceSyncFailed extends Schema.TaggedError<WorkspaceSyncFailed>()(
  "WorkspaceSyncFailed",
  {
    category: OperationErrorCategorySchema,
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** Every failure the rendered-file cleanup sweep surfaces. */
export type WorkspaceSyncCleanupFailure =
  WorkspaceSyncFailed | ExtensionManagerFailure | NativeFormatFailure | Config.ConfigError;

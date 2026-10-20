/**
 * The refusal a workspace operation settles with. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim. Each family that
 * refuses constructs the refusal through its own helper, which stamps the
 * family's diagnostic kind.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { FailureMetadataSchema, FailureSuggestedActionSchema, ErrorCodeSchema } from "./errors.js";
import { FailureDiagnosticSchema, type FailureDiagnostic } from "./failure-diagnostic.js";
import { defineFailureFamily, renderCarriedFailure } from "./failure-family.js";

/**
 * A workspace policy step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code,
 * `recover`/`cmd` fold into the leading suggested action, `diagnostic` names
 * the refusing family, and `title`, `detail`, `metadata`, `retryable`,
 * `suggestions`, and `cause` carry over verbatim.
 */
export class OperationRefused extends Schema.TaggedError<OperationRefused>()("OperationRefused", {
  category: ErrorCodeSchema,
  diagnostic: FailureDiagnosticSchema,
  title: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String),
  metadata: Schema.optional(FailureMetadataSchema),
  retryable: Schema.optional(Schema.Boolean),
  recover: Schema.optional(Schema.String),
  cmd: Schema.optional(Schema.String),
  suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
  cause: Schema.optional(Schema.Unknown),
}) {}

/** What a producer states when it refuses; its family's helper names the refusal. */
type RefusalFields = Omit<ConstructorParameters<typeof OperationRefused>[0], "diagnostic">;

/** Construct a refusal under one family's diagnostic kind. */
export const refusalOf =
  (diagnostic: FailureDiagnostic) =>
  (fields: RefusalFields): OperationRefused =>
    new OperationRefused({ ...fields, diagnostic });

/**
 * Refuse an install, update, uninstall, or other extension lifecycle change
 * with the category, wording, and recovery the feature decided.
 */
export const installRefused = refusalOf({
  kind: "extension-lifecycle-failed",
  operation: "workspace.operation",
});

/** Every refusal renders from the fields its producer carried. */
export const operationRefusals = defineFailureFamily({
  classes: () => [OperationRefused] as const,
  render: (failure: OperationRefused) => renderCarriedFailure(failure),
});

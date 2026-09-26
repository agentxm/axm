/**
 * The refusal an extension lifecycle operation settles with. The producer
 * owns the category choice and user-facing wording; the application boundary
 * converts the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  FailureMetadataSchema,
  FailureSuggestedActionSchema,
  OperationErrorCategorySchema,
} from "./errors.js";
/**
 * A lifecycle policy step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code,
 * `recover`/`cmd` fold into the leading suggested action, and `title`,
 * `detail`, `metadata`, `retryable`, `suggestions`, and `cause` carry over
 * verbatim.
 */
export class ExtensionLifecycleFailed extends Schema.TaggedError<ExtensionLifecycleFailed>()(
  "ExtensionLifecycleFailed",
  {
    category: OperationErrorCategorySchema,
    title: Schema.optional(Schema.String),
    detail: Schema.optional(Schema.String),
    metadata: Schema.optional(FailureMetadataSchema),
    retryable: Schema.optional(Schema.Boolean),
    recover: Schema.optional(Schema.String),
    cmd: Schema.optional(Schema.String),
    suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * Refuse an install or uninstall with the category, wording, and recovery the
 * feature decided. The application converts the carried fields into its error
 * envelope verbatim, so the producer owns the refusal rather than the shell.
 */
export const installRefused = (fields: {
  readonly category: ExtensionLifecycleFailed["category"];
  readonly detail: string;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ExtensionLifecycleFailed["suggestions"];
  readonly cause?: unknown;
}): ExtensionLifecycleFailed =>
  new ExtensionLifecycleFailed({
    category: fields.category,
    detail: fields.detail,
    ...(fields.recover === undefined ? {} : { recover: fields.recover }),
    ...(fields.cmd === undefined ? {} : { cmd: fields.cmd }),
    ...(fields.suggestions === undefined ? {} : { suggestions: fields.suggestions }),
    ...(fields.cause === undefined ? {} : { cause: fields.cause }),
  });

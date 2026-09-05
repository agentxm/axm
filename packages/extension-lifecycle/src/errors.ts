/**
 * Typed failures for the extension-lifecycle feature. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { CoupledDependencyFailure } from "@agentxm/extension-workspace";

const CarriedSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/**
 * A lifecycle policy step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code,
 * `recover`/`cmd` fold into the leading suggested action, and `title`,
 * `detail`, `suggestions`, and `cause` carry over verbatim.
 */
export class ExtensionLifecycleFailed extends Schema.TaggedError<ExtensionLifecycleFailed>()(
  "ExtensionLifecycleFailed",
  {
    category: Schema.Literals([
      "conflict",
      "internal",
      "network",
      "not_found",
      "usage",
      "validation",
    ]),
    title: Schema.optional(Schema.String),
    detail: Schema.optional(Schema.String),
    recover: Schema.optional(Schema.String),
    cmd: Schema.optional(Schema.String),
    suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * Carry a lifecycle dependency's failure opaquely through a kernel-typed
 * manager channel. The application boundary restores and converts the carried
 * failure, so rendering, exit codes, and machine output stay byte-identical
 * with the previous in-place conversion.
 */
export const coupleLifecycleDependencyFailure = (failure: unknown): CoupledDependencyFailure =>
  new CoupledDependencyFailure({ failure });

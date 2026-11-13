/**
 * Typed failures for workspace inspection queries. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

import { InstallableExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/installable-types";

/**
 * A workspace inspection query could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceInspectionFailed extends Schema.TaggedError<WorkspaceInspectionFailed>()(
  "WorkspaceInspectionFailed",
  {
    category: Schema.Literals(["internal", "validation", "conflict"]),
    detail: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * The named extension is neither configured, accepted, nor present in the
 * selected scope. The carried scope lets the caller offer the right inventory
 * command as recovery.
 */
export class ExtensionNotInstalled extends Schema.TaggedError<ExtensionNotInstalled>()(
  "ExtensionNotInstalled",
  {
    type: InstallableExtensionTypeSchema,
    name: Schema.String,
    scope: Schema.Literals(["project", "user"]),
  },
) {}

/**
 * A published-metadata read refused: the selected registry is not configured,
 * a local name omitted its type, or the target or field is unavailable.
 */
export class PublishedMetadataUnavailable extends Schema.TaggedError<PublishedMetadataUnavailable>()(
  "PublishedMetadataUnavailable",
  {
    reason: Schema.Literals([
      "registry-not-configured",
      "type-required",
      "unqualified-name",
      "not-found",
      "unknown-field",
      "field-unavailable",
    ]),
    detail: Schema.String,
  },
) {}

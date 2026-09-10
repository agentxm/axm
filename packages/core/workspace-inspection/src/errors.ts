/**
 * Typed failures for workspace-inspection queries. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

import { CatalogExtensionTypeSchema } from "@agentxm/extension-model/unstable/extension-types";

/**
 * A workspace-inspection query could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceInspectionFailed extends Schema.TaggedError<WorkspaceInspectionFailed>()(
  "WorkspaceInspectionFailed",
  {
    category: Schema.Literals(["internal", "validation"]),
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
    type: CatalogExtensionTypeSchema,
    name: Schema.String,
    scope: Schema.Literals(["project", "user"]),
  },
) {}

/**
 * A pack inspection refused the request: the identity did not match what the
 * workspace configured, the configured locator is not a pack identity, or the
 * canonical content is unavailable.
 */
export class PackInspectionRefused extends Schema.TaggedError<PackInspectionRefused>()(
  "PackInspectionRefused",
  {
    reason: Schema.Literals([
      "not-a-pack-identity",
      "not-configured",
      "owner-required",
      "identity-mismatch",
      "canonical-unavailable",
      "manifest-unavailable",
      "manifest-unreadable",
    ]),
    detail: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * A published-metadata read refused: the selected registry is not configured,
 * a bare name matched more than one extension, or nothing matched at all.
 */
export class PublishedMetadataUnavailable extends Schema.TaggedError<PublishedMetadataUnavailable>()(
  "PublishedMetadataUnavailable",
  {
    reason: Schema.Literals([
      "registry-not-configured",
      "workspace-not-initialized",
      "ambiguous-name",
      "unqualified-name",
      "not-found",
      "unknown-field",
      "field-unavailable",
    ]),
    detail: Schema.String,
    matches: Schema.optional(Schema.Array(Schema.String)),
  },
) {}

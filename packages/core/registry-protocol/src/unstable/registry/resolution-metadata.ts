/**
 * Repeat-safe Registry metadata query contract. Selection stays with the
 * client; each response page is evidence for one authorized identity and
 * revision.
 */

import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { ArchivalViewSchema } from "@agentxm/extension-model/unstable/extensions/archival";
import {
  AuthorSchema,
  BugsSchema,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  RepositorySchema,
} from "@agentxm/extension-model/unstable/extensions/common";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import * as Schema from "effect/Schema";
import { VersionEntrySchema } from "./schema.js";

export const RESOLUTION_SCHEMA_VERSION = 2;
export const RESOLUTION_SELECTION_POLICY_VERSION = "1";
export const MAX_RESOLUTION_ITEMS = 100;
const MAX_RESOLUTION_METADATA_VERSIONS_PER_PAGE = 100;
export const MAX_RESOLUTION_REQUEST_BYTES = 256 * 1024;
export const MAX_RESOLUTION_RESPONSE_BYTES = 1024 * 1024;

/** Portable wire text that is also representable at the authoritative SQL boundary. */
export const ResolutionTextSchema = Schema.NonEmptyString.check(
  Schema.makeFilter((value) => !value.includes("\u0000") || "Text cannot contain NUL"),
  Schema.isPattern(/^[^\uD800-\uDFFF]*$/u),
);

export const ResolutionMetadataIdentitySchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
}).annotate({ identifier: "ResolutionMetadataIdentity" });

export const CallerKeySchema = ResolutionTextSchema.check(Schema.isMaxLength(128)).annotate({
  identifier: "ResolutionMetadataCallerKey",
  description: "Opaque caller correlation key. It grants no identity or authority.",
});

const RevisionSchema = ResolutionTextSchema.check(Schema.isMaxLength(256)).annotate({
  identifier: "ResolutionMetadataRevision",
});

const ContinuationSchema = ResolutionTextSchema.check(Schema.isMaxLength(2048)).annotate({
  identifier: "ResolutionMetadataContinuation",
  description: "Opaque token bound by the server to the request context and revision.",
});

const RequestEvidenceSchema = {
  key: CallerKeySchema,
  identity: ResolutionMetadataIdentitySchema,
  expectedPublisherBinding: Schema.optional(ResolutionTextSchema),
  knownRevision: Schema.optional(RevisionSchema),
  continuation: Schema.optional(
    Schema.Struct({ token: ContinuationSchema, revision: RevisionSchema }),
  ),
};

const ResolutionMetadataItemSchema = Schema.Struct(RequestEvidenceSchema).check(
  Schema.makeFilter((item) =>
    item.knownRevision === undefined || item.continuation === undefined
      ? true
      : "A continuation cannot also send a conditional revision",
  ),
);

export const ResolutionMetadataRequestSchema = Schema.Struct({
  schemaVersion: Schema.Literal(RESOLUTION_SCHEMA_VERSION),
  purpose: Schema.Literal("select"),
  selectionPolicyVersion: Schema.Literal(RESOLUTION_SELECTION_POLICY_VERSION),
  items: Schema.Array(ResolutionMetadataItemSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_RESOLUTION_ITEMS),
    Schema.makeFilter((items) =>
      new Set(items.map((item) => item.key)).size === items.length
        ? true
        : "Caller keys must be unique within a batch",
    ),
  ),
}).annotate({ identifier: "ResolutionMetadataRequest" });

export type ResolutionMetadataRequest = typeof ResolutionMetadataRequestSchema.Type;

const CurrentEvidenceFieldsSchema = {
  publisherBindingId: Schema.NonEmptyString,
  visibility: Schema.Literals(["public", "private"] as const),
  archival: Schema.NullOr(ArchivalViewSchema),
  deprecation: Schema.NullOr(DeprecationViewSchema),
  revision: RevisionSchema,
  observedAt: DateTimeUtcSchema,
  validUntil: DateTimeUtcSchema,
};

const MetadataFieldsSchema = {
  ...CurrentEvidenceFieldsSchema,
  description: Schema.optional(Schema.String),
  repository: Schema.optional(RepositorySchema),
  bugs: Schema.optional(BugsSchema),
  license: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.Array(AuthorSchema)),
};

const MetadataPageSchema = Schema.Struct({
  ...MetadataFieldsSchema,
  versions: Schema.Array(VersionEntrySchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_RESOLUTION_METADATA_VERSIONS_PER_PAGE),
  ),
  continuation: Schema.NullOr(ContinuationSchema),
}).annotate({ identifier: "ResolutionMetadataPage" });

const MetadataOutcomeSchema = Schema.Struct({
  key: CallerKeySchema,
  outcome: Schema.Literal("metadata"),
  page: MetadataPageSchema,
});

const UnchangedOutcomeSchema = Schema.Struct({
  key: CallerKeySchema,
  outcome: Schema.Literal("unchanged"),
  ...CurrentEvidenceFieldsSchema,
});

const UnavailableOutcomeSchema = Schema.Struct({
  key: CallerKeySchema,
  outcome: Schema.Literal("unavailable"),
});

const BindingConflictOutcomeSchema = Schema.Struct({
  key: CallerKeySchema,
  outcome: Schema.Literal("binding-conflict"),
  publisherBindingId: Schema.NonEmptyString,
});

const RestartRequiredOutcomeSchema = Schema.Struct({
  key: CallerKeySchema,
  outcome: Schema.Literal("restart-required"),
  revision: RevisionSchema,
});

const ResolutionMetadataOutcomeSchema = Schema.Union([
  MetadataOutcomeSchema,
  UnchangedOutcomeSchema,
  UnavailableOutcomeSchema,
  BindingConflictOutcomeSchema,
  RestartRequiredOutcomeSchema,
]);

export type ResolutionMetadataOutcome = typeof ResolutionMetadataOutcomeSchema.Type;

export const ResolutionMetadataResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(RESOLUTION_SCHEMA_VERSION),
  purpose: Schema.Literal("select"),
  selectionPolicyVersion: Schema.Literal(RESOLUTION_SELECTION_POLICY_VERSION),
  observedAt: DateTimeUtcSchema,
  results: Schema.Array(ResolutionMetadataOutcomeSchema).check(
    Schema.isMaxLength(MAX_RESOLUTION_ITEMS),
  ),
}).annotate({ identifier: "ResolutionMetadataResponse" });

export type ResolutionMetadataResponse = typeof ResolutionMetadataResponseSchema.Type;

export interface ResolutionError {
  readonly code:
    | "invalid-request"
    | "unsupported-schema-version"
    | "unsupported-selection-policy-version"
    | "request-too-large"
    | "response-too-large"
    | "backend-unavailable";
  readonly detail: string;
}

/** Match by caller key, never position; reject missing, duplicate, or unsolicited evidence. */
export const resolutionMetadataResponseMatchesRequest = (
  request: ResolutionMetadataRequest,
  response: ResolutionMetadataResponse,
): boolean => {
  if (response.results.length !== request.items.length) return false;
  const items = new Map(request.items.map((item) => [item.key, item]));
  const seen = new Set<string>();
  return response.results.every((result) => {
    const item = items.get(result.key);
    if (item === undefined || seen.has(result.key)) return false;
    seen.add(result.key);
    if (result.outcome === "unchanged")
      return (
        item.knownRevision === result.revision &&
        (item.expectedPublisherBinding === undefined ||
          item.expectedPublisherBinding === result.publisherBindingId)
      );
    if (
      result.outcome === "metadata" &&
      item.expectedPublisherBinding !== undefined &&
      result.page.publisherBindingId !== item.expectedPublisherBinding
    )
      return false;
    if (item.continuation === undefined) return result.outcome !== "restart-required";
    return result.outcome !== "metadata" || result.page.revision === item.continuation.revision;
  });
};

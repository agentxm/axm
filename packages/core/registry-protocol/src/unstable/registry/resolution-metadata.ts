/**
 * Repeat-safe Registry metadata query contract. Selection stays with the client;
 * each response page is evidence for one authorized identity and revision.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import {
  AuthorSchema,
  BugsSchema,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  RepositorySchema,
} from "@agentxm/extension-model/unstable/extensions/common";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import { ArchivalViewSchema } from "@agentxm/extension-model/unstable/extensions/archival";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { VersionEntrySchema } from "./schema.js";

export const RESOLUTION_METADATA_SCHEMA_VERSION = 1;
export const RESOLUTION_SELECTION_POLICY_VERSION = "1";
export const MAX_RESOLUTION_METADATA_ITEMS = 100;
export const MAX_RESOLUTION_METADATA_VERSIONS_PER_PAGE = 100;
export const MAX_RESOLUTION_METADATA_REQUEST_BYTES = 256 * 1024;
export const MAX_RESOLUTION_METADATA_RESPONSE_BYTES = 1024 * 1024;

export const ResolutionMetadataIdentitySchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
}).annotate({ identifier: "ResolutionMetadataIdentity" });

const CallerKeySchema = Schema.NonEmptyString.check(Schema.isMaxLength(128)).annotate({
  identifier: "ResolutionMetadataCallerKey",
  description: "Opaque caller correlation key. It grants no identity or authority.",
});

const RevisionSchema = Schema.NonEmptyString.check(Schema.isMaxLength(256)).annotate({
  identifier: "ResolutionMetadataRevision",
});

const ContinuationSchema = Schema.NonEmptyString.check(Schema.isMaxLength(2048)).annotate({
  identifier: "ResolutionMetadataContinuation",
  description: "Opaque token bound by the server to the request context and revision.",
});

const RequestEvidenceSchema = {
  key: CallerKeySchema,
  identity: ResolutionMetadataIdentitySchema,
  expectedPublisherBinding: Schema.optional(Schema.NonEmptyString),
  knownRevision: Schema.optional(RevisionSchema),
  continuation: Schema.optional(
    Schema.Struct({ token: ContinuationSchema, revision: RevisionSchema }),
  ),
};

const SelectItemSchema = Schema.Struct({
  ...RequestEvidenceSchema,
  purpose: Schema.Literal("select"),
});

const RestoreExactItemSchema = Schema.Struct({
  ...RequestEvidenceSchema,
  purpose: Schema.Literal("restore-exact"),
  accepted: Schema.Struct({
    version: VersionSchema,
    integrity: Schema.NonEmptyString,
  }),
});

export const ResolutionMetadataItemSchema = Schema.Union([
  SelectItemSchema,
  RestoreExactItemSchema,
]).check(
  Schema.makeFilter((item) =>
    item.knownRevision === undefined || item.continuation === undefined
      ? true
      : "A continuation cannot also send a conditional revision",
  ),
);

export const ResolutionMetadataRequestSchema = Schema.Struct({
  schemaVersion: Schema.Literal(RESOLUTION_METADATA_SCHEMA_VERSION),
  selectionPolicyVersion: Schema.Literal(RESOLUTION_SELECTION_POLICY_VERSION),
  items: Schema.Array(ResolutionMetadataItemSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_RESOLUTION_METADATA_ITEMS),
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
  exactVersion: Schema.optional(VersionSchema),
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

const ExactConflictOutcomeSchema = Schema.Struct({
  key: CallerKeySchema,
  outcome: Schema.Literal("exact-conflict"),
  reason: Schema.Literals(["version-unavailable", "integrity-mismatch"] as const),
});

const RestartRequiredOutcomeSchema = Schema.Struct({
  key: CallerKeySchema,
  outcome: Schema.Literal("restart-required"),
  revision: RevisionSchema,
});

export const ResolutionMetadataOutcomeSchema = Schema.Union([
  MetadataOutcomeSchema,
  UnchangedOutcomeSchema,
  UnavailableOutcomeSchema,
  BindingConflictOutcomeSchema,
  ExactConflictOutcomeSchema,
  RestartRequiredOutcomeSchema,
]);

export type ResolutionMetadataOutcome = typeof ResolutionMetadataOutcomeSchema.Type;

export const ResolutionMetadataResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(RESOLUTION_METADATA_SCHEMA_VERSION),
  selectionPolicyVersion: Schema.Literal(RESOLUTION_SELECTION_POLICY_VERSION),
  observedAt: DateTimeUtcSchema,
  results: Schema.Array(ResolutionMetadataOutcomeSchema).check(
    Schema.isMaxLength(MAX_RESOLUTION_METADATA_ITEMS),
  ),
}).annotate({ identifier: "ResolutionMetadataResponse" });

export type ResolutionMetadataResponse = typeof ResolutionMetadataResponseSchema.Type;

/** Validate the response against the submitted keys before consuming any page. */
export const resolutionMetadataResponseMatchesRequest = (
  request: ResolutionMetadataRequest,
  response: ResolutionMetadataResponse,
): boolean =>
  response.results.length === request.items.length &&
  response.results.every((result, index) => {
    const item = request.items[index];
    if (item === undefined || result.key !== item.key) return false;
    if (item.continuation === undefined) return result.outcome !== "restart-required";
    return (
      result.outcome !== "unchanged" &&
      (result.outcome !== "metadata" || result.page.revision === item.continuation.revision)
    );
  });

export const ResolutionMetadataErrorSchema = Schema.Struct({
  code: Schema.Literals([
    "invalid-request",
    "unsupported-schema-version",
    "unsupported-selection-policy-version",
    "request-too-large",
    "response-too-large",
    "backend-unavailable",
  ] as const),
  detail: Schema.String,
});

export type ResolutionMetadataError = typeof ResolutionMetadataErrorSchema.Type;

const decodeRequest = Schema.decodeUnknownResult(ResolutionMetadataRequestSchema);
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/** Apply the encoded body limit before parsing an untrusted request. */
export const decodeResolutionMetadataRequestBody = (
  body: Uint8Array,
): Result.Result<ResolutionMetadataRequest, ResolutionMetadataError> => {
  if (body.byteLength > MAX_RESOLUTION_METADATA_REQUEST_BYTES) {
    return Result.fail({
      code: "request-too-large",
      detail: "Resolution metadata request exceeds the encoded body limit.",
    });
  }

  let input: unknown;
  try {
    input = JSON.parse(strictUtf8.decode(body));
  } catch {
    return Result.fail({
      code: "invalid-request",
      detail: "Resolution metadata request is not valid UTF-8 JSON.",
    });
  }

  if (typeof input === "object" && input !== null) {
    if ("schemaVersion" in input && input.schemaVersion !== RESOLUTION_METADATA_SCHEMA_VERSION) {
      return Result.fail({
        code: "unsupported-schema-version",
        detail: "Resolution metadata schema version is unsupported.",
      });
    }
    if (
      "selectionPolicyVersion" in input &&
      input.selectionPolicyVersion !== RESOLUTION_SELECTION_POLICY_VERSION
    ) {
      return Result.fail({
        code: "unsupported-selection-policy-version",
        detail: "Resolution selection policy version is unsupported.",
      });
    }
  }

  const decoded = decodeRequest(input, { onExcessProperty: "error" });
  return Result.isFailure(decoded)
    ? Result.fail({ code: "invalid-request", detail: "Resolution metadata request is invalid." })
    : Result.succeed(decoded.success);
};

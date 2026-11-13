import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  CallerKeySchema,
  ResolutionTextSchema,
  ResolutionMetadataIdentitySchema,
  ResolutionMetadataRequestSchema,
  ResolutionMetadataResponseSchema,
  MAX_RESOLUTION_ITEMS,
  MAX_RESOLUTION_REQUEST_BYTES,
  RESOLUTION_SCHEMA_VERSION,
  RESOLUTION_SELECTION_POLICY_VERSION,
  type ResolutionError,
} from "./resolution-metadata.js";

const AcceptedContentSchema = Schema.Struct({
  version: VersionSchema,
  integrity: ResolutionTextSchema,
});
const ExactContentItemSchema = Schema.Struct({
  key: CallerKeySchema,
  identity: ResolutionMetadataIdentitySchema,
  expectedPublisherBinding: ResolutionTextSchema,
  accepted: AcceptedContentSchema,
});

export const ExactContentRequestSchema = Schema.Struct({
  schemaVersion: Schema.Literal(RESOLUTION_SCHEMA_VERSION),
  purpose: Schema.Literal("authorize-exact"),
  items: Schema.Array(ExactContentItemSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_RESOLUTION_ITEMS),
    Schema.makeFilter(
      (items) =>
        new Set(items.map(({ key }) => key)).size === items.length ||
        "Caller keys must be unique within a batch",
    ),
  ),
}).annotate({ identifier: "ExactContentRequest" });
export type ExactContentRequest = typeof ExactContentRequestSchema.Type;

const ExactContentOutcomeSchema = Schema.Union([
  Schema.Struct({
    key: CallerKeySchema,
    outcome: Schema.Literal("allowed"),
    identity: ResolutionMetadataIdentitySchema,
    publisherBindingId: Schema.NonEmptyString,
    accepted: AcceptedContentSchema,
    yanked: Schema.Boolean,
    observedAt: DateTimeUtcSchema,
  }),
  Schema.Struct({
    key: CallerKeySchema,
    outcome: Schema.Literal("unavailable"),
  }),
  Schema.Struct({
    key: CallerKeySchema,
    outcome: Schema.Literal("binding-conflict"),
    publisherBindingId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    key: CallerKeySchema,
    outcome: Schema.Literal("exact-conflict"),
    reason: Schema.Literals(["version-unavailable", "integrity-mismatch"]),
  }),
  Schema.Struct({
    key: CallerKeySchema,
    outcome: Schema.Literal("lifecycle-blocked"),
    reason: Schema.Literal("held"),
  }),
  Schema.Struct({
    key: CallerKeySchema,
    outcome: Schema.Literal("temporarily-unavailable"),
  }),
]);

export const ExactContentResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(RESOLUTION_SCHEMA_VERSION),
  purpose: Schema.Literal("authorize-exact"),
  observedAt: DateTimeUtcSchema,
  results: Schema.Array(ExactContentOutcomeSchema).check(Schema.isMaxLength(MAX_RESOLUTION_ITEMS)),
}).annotate({ identifier: "ExactContentResponse" });
export type ExactContentResponse = typeof ExactContentResponseSchema.Type;

export const ResolutionRequestSchema = Schema.Union([
  ResolutionMetadataRequestSchema,
  ExactContentRequestSchema,
]);
export const ResolutionResponseSchema = Schema.Union([
  ResolutionMetadataResponseSchema,
  ExactContentResponseSchema,
]);
export type ResolutionRequest = typeof ResolutionRequestSchema.Type;
export type ResolutionResponse = typeof ResolutionResponseSchema.Type;

const decodeRequest = Schema.decodeUnknownResult(ResolutionRequestSchema);
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/** Enforce encoded bounds before JSON parsing and reject legacy or mixed-purpose input. */
export const decodeResolutionRequestBody = (
  body: Uint8Array,
): Result.Result<ResolutionRequest, ResolutionError> => {
  if (body.byteLength > MAX_RESOLUTION_REQUEST_BYTES)
    return Result.fail({
      code: "request-too-large",
      detail: "Resolution request exceeds the encoded body limit.",
    });
  let input: unknown;
  try {
    input = JSON.parse(strictUtf8.decode(body));
  } catch {
    return Result.fail({
      code: "invalid-request",
      detail: "Resolution request is not valid UTF-8 JSON.",
    });
  }
  if (typeof input === "object" && input !== null) {
    if ("schemaVersion" in input && input.schemaVersion !== RESOLUTION_SCHEMA_VERSION)
      return Result.fail({
        code: "unsupported-schema-version",
        detail: "Resolution schema version is unsupported.",
      });
    if (
      "selectionPolicyVersion" in input &&
      input.selectionPolicyVersion !== RESOLUTION_SELECTION_POLICY_VERSION
    )
      return Result.fail({
        code: "unsupported-selection-policy-version",
        detail: "Resolution selection policy version is unsupported.",
      });
  }
  const result = decodeRequest(input, { onExcessProperty: "error" });
  return Result.isFailure(result)
    ? Result.fail({
        code: "invalid-request",
        detail: "Resolution request is invalid.",
      })
    : Result.succeed(result.success);
};

/** An allowance applies only to the exact submitted identity, publisher, and bytes. */
export const exactContentResponseMatchesRequest = (
  request: ExactContentRequest,
  response: ExactContentResponse,
): boolean => {
  if (response.results.length !== request.items.length) return false;
  const items = new Map(request.items.map((item) => [item.key, item]));
  const seen = new Set<string>();
  return response.results.every((result) => {
    const item = items.get(result.key);
    if (item === undefined || seen.has(result.key)) return false;
    seen.add(result.key);
    return (
      result.outcome !== "allowed" ||
      (result.identity.owner === item.identity.owner &&
        result.identity.type === item.identity.type &&
        result.identity.name === item.identity.name &&
        result.publisherBindingId === item.expectedPublisherBinding &&
        result.accepted.version === item.accepted.version &&
        result.accepted.integrity === item.accepted.integrity)
    );
  });
};

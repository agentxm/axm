/** Source and Registry contracts for whole-Extension visibility. */

import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";
import {
  ExtensionFqnSchema,
  ExtensionVisibilitySchema,
  type ExtensionVisibility,
} from "../extensions/common.js";

export const VisibilityFingerprintSchema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/),
).annotate({ identifier: "VisibilityFingerprint" });

export type VisibilityFingerprint = typeof VisibilityFingerprintSchema.Type;

export const VisibilityRevisionSchema = Schema.NonEmptyString.annotate({
  identifier: "VisibilityRevision",
  description: "Opaque revision for conditional whole-Extension visibility mutation.",
});

export type VisibilityRevision = typeof VisibilityRevisionSchema.Type;

export const VisibilityIntentSchema = Schema.Struct({
  value: ExtensionVisibilitySchema,
  source: Schema.Literals(["manifest", "workspace"] as const),
  fingerprint: VisibilityFingerprintSchema,
}).annotate({ identifier: "VisibilityIntent" });

export type VisibilityIntent = typeof VisibilityIntentSchema.Type;

export interface VisibilityIntentSource {
  readonly value: ExtensionVisibility;
  readonly material: string;
}

export interface ResolveVisibilityIntentArgs {
  readonly manifest?: VisibilityIntentSource;
  readonly workspace?: VisibilityIntentSource;
}

const fingerprint = (source: "manifest" | "workspace", input: VisibilityIntentSource) =>
  Schema.decodeUnknownSync(VisibilityFingerprintSchema)(
    createHash("sha256")
      .update(JSON.stringify({ source, value: input.value, material: input.material }))
      .digest("hex"),
  );

export const resolveVisibilityIntent = (
  args: ResolveVisibilityIntentArgs,
): VisibilityIntent | null => {
  if (args.manifest !== undefined) {
    return {
      value: args.manifest.value,
      source: "manifest",
      fingerprint: fingerprint("manifest", args.manifest),
    };
  }
  if (args.workspace !== undefined) {
    return {
      value: args.workspace.value,
      source: "workspace",
      fingerprint: fingerprint("workspace", args.workspace),
    };
  }
  return null;
};

export const PublishVisibilitySchema = Schema.Union([
  Schema.Struct({
    value: ExtensionVisibilitySchema,
    disposition: Schema.Literal("establish"),
    source: Schema.Literals(["manifest", "workspace", "explicit", "account", "platform"]),
  }),
  Schema.Struct({
    value: ExtensionVisibilitySchema,
    disposition: Schema.Literal("preserve"),
    source: Schema.Literal("existing"),
  }),
]).annotate({
  identifier: "PublishVisibility",
  title: "Publish Visibility",
  description:
    "Authoritative whole-Extension visibility and provenance resolved for a publication.",
});

export type PublishVisibility = typeof PublishVisibilitySchema.Type;

export const VisibilityActualSchema = Schema.Struct({
  value: ExtensionVisibilitySchema,
  revision: VisibilityRevisionSchema,
}).annotate({ identifier: "VisibilityActual" });

export type VisibilityActual = typeof VisibilityActualSchema.Type;

export const VisibilityComparisonSchema = Schema.Literals([
  "not-established",
  "unconfigured",
  "match",
  "drift",
] as const).annotate({ identifier: "VisibilityComparison" });

export type VisibilityComparison = typeof VisibilityComparisonSchema.Type;

export const VisibilityFindingCodeSchema = Schema.Literals([
  "visibility/intent-conflict",
  "visibility/drift",
  "visibility/unavailable",
  "visibility/intent-required",
  "visibility/not-established",
  "visibility/stale-source",
  "visibility/stale-revision",
  "visibility/confirmation-required",
  "visibility/authorization-denied",
  "visibility/impersonation-denied",
  "visibility/verification-required",
  "visibility/verification-expired",
  "visibility/verification-cancelled",
  "visibility/verification-replayed",
  "visibility/pack-blocked",
] as const).annotate({ identifier: "VisibilityFindingCode" });

export type VisibilityFindingCode = typeof VisibilityFindingCodeSchema.Type;

export const VisibilityFindingSchema = Schema.Struct({
  code: VisibilityFindingCodeSchema,
  severity: Schema.Literals(["error", "warning"] as const),
  message: Schema.String,
}).annotate({ identifier: "VisibilityFinding" });

export type VisibilityFinding = typeof VisibilityFindingSchema.Type;

export const VisibilityEvaluationSchema = Schema.Struct({
  target: ExtensionFqnSchema,
  intent: Schema.NullOr(VisibilityIntentSchema),
  request: Schema.NullOr(ExtensionVisibilitySchema),
  resolved: Schema.NullOr(PublishVisibilitySchema),
  actual: Schema.NullOr(VisibilityActualSchema),
  comparison: VisibilityComparisonSchema,
  findings: Schema.Array(VisibilityFindingSchema),
}).annotate({ identifier: "VisibilityEvaluation" });

export type VisibilityEvaluation = typeof VisibilityEvaluationSchema.Type;

export const VisibilityEvaluationUnavailableSchema = Schema.Struct({
  target: ExtensionFqnSchema,
  unavailable: Schema.Literal(true),
  findings: Schema.Array(VisibilityFindingSchema),
}).annotate({ identifier: "VisibilityEvaluationUnavailable" });

export type VisibilityEvaluationUnavailable = typeof VisibilityEvaluationUnavailableSchema.Type;

export const VisibilityEvaluationResultSchema = Schema.Union([
  VisibilityEvaluationSchema,
  VisibilityEvaluationUnavailableSchema,
]).annotate({ identifier: "VisibilityEvaluationResult" });

export type VisibilityEvaluationResult = typeof VisibilityEvaluationResultSchema.Type;

export const VisibilityMutationAuthoritySchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("operator") }),
  Schema.Struct({
    kind: Schema.Literal("repository"),
    source: Schema.Literals(["manifest", "workspace"] as const),
    fingerprint: VisibilityFingerprintSchema,
  }),
]).annotate({ identifier: "VisibilityMutationAuthority" });

export type VisibilityMutationAuthority = typeof VisibilityMutationAuthoritySchema.Type;

export const VisibilityMutationRequestSchema = Schema.Struct({
  target: ExtensionFqnSchema,
  visibility: ExtensionVisibilitySchema,
  revision: VisibilityRevisionSchema,
  authority: VisibilityMutationAuthoritySchema,
  verification: Schema.optional(Schema.NonEmptyString),
}).annotate({ identifier: "VisibilityMutationRequest" });

export type VisibilityMutationRequest = typeof VisibilityMutationRequestSchema.Type;

export const VisibilityMutationResultSchema = Schema.Struct({
  target: ExtensionFqnSchema,
  before: ExtensionVisibilitySchema,
  after: ExtensionVisibilitySchema,
  authority: VisibilityMutationAuthoritySchema,
  result: Schema.Literals(["already-satisfied", "changed"] as const),
  revision: VisibilityRevisionSchema,
}).annotate({ identifier: "VisibilityMutationResult" });

export type VisibilityMutationResult = typeof VisibilityMutationResultSchema.Type;

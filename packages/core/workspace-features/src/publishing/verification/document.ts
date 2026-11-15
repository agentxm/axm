/**
 * The release verification result (`release-verification-v1`): what one
 * invocation observed about each selected release, assessed per evidence
 * level, and the one verdict those assessments decide.
 *
 * Coverage is evidence about the assessment's execution, kept separate from
 * the conclusion about the release. Repeated facts are stated once: the
 * Registry at document level, each request once, and each distinct release
 * once with references to every request that named it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import {
  ExtensionNameSchema,
  ExtensionTypeSchema,
  HandleSchema,
} from "@agentxm/extension-model/unstable/extensions";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";

import { PublishResultSchema } from "../publish/result.js";

export const RELEASE_VERIFICATION_CONTRACT = "release-verification-v1" as const;

const publishedItem = PublishResultSchema.fields.publicationSet.fields.items.value.fields;
const publishedOutcome = PublishResultSchema.fields.execution.fields.outcomes.value.fields;

const ReleaseVerificationCheckSchema = Schema.Literals([
  "presence",
  "identity",
  "archive",
] as const).annotate({
  identifier: "ReleaseVerificationCheck",
  title: "Release Verification Check",
  description: "One evidence level every selected release is assessed at.",
});
export type ReleaseVerificationCheck = typeof ReleaseVerificationCheckSchema.Type;

const ReleaseVerificationCoverageSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("complete") }),
  Schema.Struct({ state: Schema.Literal("incomplete"), reasons: Schema.Array(Schema.String) }),
  Schema.Struct({ state: Schema.Literal("not-applicable"), reason: Schema.String }),
]).annotate({
  identifier: "ReleaseVerificationCoverage",
  title: "Release Verification Coverage",
  description:
    "Whether the assessment ran to completion; evidence about execution, not the condition of the release.",
});

const ReleaseVerificationAssessmentSchema = Schema.Struct({
  coverage: ReleaseVerificationCoverageSchema,
  conclusion: Schema.Literals([
    "satisfied",
    "attention-required",
    "unknown",
    "not-applicable",
  ] as const),
  finding: Schema.optionalKey(
    Schema.Literals(["extension-unavailable", "version-missing", "integrity-mismatch"] as const),
  ),
  /** The Registry client's failure, when the evidence could not be obtained. */
  failure: Schema.optionalKey(Schema.Struct({ category: Schema.String, message: Schema.String })),
}).annotate({
  identifier: "ReleaseVerificationAssessment",
  title: "Release Verification Assessment",
  description: "One evidence level for one release: its coverage, conclusion, and finding.",
});
export type ReleaseVerificationAssessment = typeof ReleaseVerificationAssessmentSchema.Type;

const ReleaseVerificationExpectationSchema = Schema.Struct({
  integrity: Schema.String,
  source: Schema.Literals(["flag", "publish-result"] as const),
}).annotate({
  identifier: "ReleaseVerificationExpectation",
  title: "Release Verification Expectation",
  description: "The caller's expected integrity and where it came from. A claim, not evidence.",
});

const ReleaseVerificationReportedSchema = Schema.Struct({
  participation: publishedItem.participation,
  action: Schema.optionalKey(publishedOutcome.action),
  status: Schema.optionalKey(publishedOutcome.status),
  settlement: Schema.optionalKey(Schema.required(publishedOutcome.settlement)),
}).annotate({
  identifier: "ReleaseVerificationReported",
  title: "Release Verification Reported Input",
  description:
    "What the supplied publish result claimed for this release, carried as input and never restated as an observation.",
});

const ReleaseVerificationObservedSchema = Schema.Struct({
  integrity: Schema.String,
  publisherBindingId: Schema.String,
  published: DateTimeUtcSchema,
  yanked: Schema.Boolean,
  yankedAt: Schema.optionalKey(DateTimeUtcSchema),
  yankCategory: Schema.optionalKey(Schema.String),
  yankMessage: Schema.optionalKey(Schema.String),
}).annotate({
  identifier: "ReleaseVerificationObserved",
  title: "Release Verification Observed Facts",
  description: "The Registry's current record of this exact version, observed in this invocation.",
});

const ReleaseVerificationReleaseSchema = Schema.Struct({
  /** `@owner/<plural-type>/<name>@<version>`. */
  id: Schema.String,
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  version: VersionSchema,
  requestRefs: Schema.Array(Schema.String),
  expectation: Schema.optionalKey(ReleaseVerificationExpectationSchema),
  reported: Schema.optionalKey(ReleaseVerificationReportedSchema),
  observed: Schema.optionalKey(ReleaseVerificationObservedSchema),
  presence: ReleaseVerificationAssessmentSchema,
  identity: ReleaseVerificationAssessmentSchema,
  archive: ReleaseVerificationAssessmentSchema,
}).annotate({
  identifier: "ReleaseVerificationRelease",
  title: "Release Verification Release",
  description: "One distinct selected release and its three assessments.",
});
export type ReleaseVerificationRelease = typeof ReleaseVerificationReleaseSchema.Type;

const ReleaseVerificationVerdictSchema = Schema.Struct({
  ok: Schema.Boolean,
  reasons: Schema.Array(
    Schema.Struct({
      check: ReleaseVerificationCheckSchema,
      code: Schema.Literals(["attention-required", "incomplete-assessment"] as const),
      /** Release ids in this document, in release order. */
      refs: Schema.Array(Schema.String),
    }),
  ),
}).annotate({
  identifier: "ReleaseVerificationVerdict",
  title: "Release Verification Verdict",
  description: "Positive only when every applicable assessment is complete and satisfied.",
});
export type ReleaseVerificationVerdict = typeof ReleaseVerificationVerdictSchema.Type;

export const ReleaseVerificationDocumentSchema = Schema.Struct({
  contract: Schema.Literal(RELEASE_VERIFICATION_CONTRACT),
  registry: Schema.Struct({
    name: Schema.String,
    endpoint: Schema.String,
    selectedBy: Schema.Literals(["flag", "publish-result", "default"] as const),
  }),
  selection: Schema.Struct({
    mode: Schema.Literals(["references", "publish-result"] as const),
    requests: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        input: Schema.String,
      }),
    ),
  }),
  releases: Schema.Array(ReleaseVerificationReleaseSchema),
  verdict: ReleaseVerificationVerdictSchema,
}).annotate({
  identifier: "ReleaseVerificationDocument",
  title: "Release Verification Document",
  description:
    "Presence, intended identity, and archive evidence for explicitly selected published releases, observed in one read-only invocation.",
});
export type ReleaseVerificationDocument = typeof ReleaseVerificationDocumentSchema.Type;

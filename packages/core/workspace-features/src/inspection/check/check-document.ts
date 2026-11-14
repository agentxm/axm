import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/common";
import { MaterializationTransitionSchema } from "@agentxm/workspace-kernel/operations";
import { NativeLocationOutcomeSchema } from "@agentxm/workspace-kernel/locations";
import {
  AxmSkillCompatibilityReportSchema,
  renderAxmSkillCompatibility,
} from "@agentxm/cli-maintenance/official-skill/domain";
import { LintJsonFindingSchema } from "@agentxm/extension-content/lint";
import { LocalInspectionDocumentSchema } from "../show/local-inspection-document.js";
import { CheckAssessmentSchema, CheckVerdictSchema } from "./check-assessment.js";
import { CheckKindSchema, type LocalCheckRequest } from "./check-selection.js";
import type { LocalCheckOwners } from "./check-owners.js";
import { captureLocalCheck } from "./local-check.js";
import { assessCapturedCheck } from "./check-result.js";

const SubjectSchema = Schema.Struct({ type: ExtensionTypeSchema, name: Schema.String });
const ConstraintContributorSchema = Schema.Struct({
  source: Schema.Literals(["settings", "pack"]),
  range: Schema.String,
  location: Schema.String,
  dependingPack: Schema.optionalKey(Schema.String),
  localName: Schema.optionalKey(Schema.String),
});
const CanonicalObservationSchema = Schema.Struct({
  ...SubjectSchema.fields,
  status: Schema.Literals([
    "not-applicable",
    "missing",
    "missing-resolution",
    "constraint-mismatch",
    "wrong-origin",
    "corrupt",
    "incomplete",
    "materialization-mismatch",
    "usable",
  ]),
  path: Schema.optionalKey(Schema.String),
  contentIdentity: Schema.optionalKey(Schema.String),
  authority: Schema.optionalKey(
    Schema.Struct({
      source: Schema.Literal("desired-state-graph"),
      identity: Schema.String,
      locator: Schema.String,
      constraints: Schema.Array(ConstraintContributorSchema),
    }),
  ),
  acceptedVersion: Schema.optionalKey(Schema.String),
  observedVersion: Schema.optionalKey(Schema.String),
});

/** Owner-derived projection evidence, with typed failures reduced to their public code. */
const ProjectionEvidenceSchema = Schema.Struct({
  predicate: Schema.Literal("workspace/projection-current"),
  subject: Schema.Struct({
    unitId: Schema.String,
    path: Schema.String,
    scope: Schema.Literals(["project", "user"]),
    owner: Schema.optionalKey(Schema.String),
    lastWrite: Schema.optionalKey(Schema.Literals(["matches", "modified", "unrecorded"])),
  }),
  authority: Schema.Struct({
    source: Schema.Literal("desired-state-graph"),
    contributors: Schema.Array(Schema.String),
  }),
  observation: Schema.Struct({
    status: Schema.Literals([
      "current",
      "missing",
      "incomplete",
      "stale",
      "obsolete",
      "unavailable",
    ]),
    contributors: Schema.optionalKey(Schema.Array(Schema.String)),
    reasonCode: Schema.optionalKey(Schema.Literals(["invalid-ownership", "unavailable"])),
    message: Schema.optionalKey(Schema.String),
    failure: Schema.optionalKey(Schema.String),
    nativeLocations: Schema.optionalKey(Schema.Array(NativeLocationOutcomeSchema)),
    exclusions: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          contributor: Schema.String,
          reason: Schema.Literals(["package-missing", "package-invalid"]),
          detail: Schema.optionalKey(Schema.String),
        }),
      ),
    ),
  }),
  expectation: Schema.Struct({
    status: Schema.Literal("current"),
    contributors: Schema.Array(Schema.String),
  }),
});

/** A captured local answer. No executable plans or live Effect values cross the output boundary. */
export const LocalCheckDocumentSchema = Schema.Struct({
  checks: Schema.Array(CheckKindSchema),
  strict: Schema.Boolean,
  selection: Schema.Struct({
    scope: LocalInspectionDocumentSchema.fields.scope,
    requests: LocalInspectionDocumentSchema.fields.requests,
  }),
  inspection: LocalInspectionDocumentSchema,
  scope: Schema.Struct({
    subjects: Schema.Array(
      Schema.Struct({
        ...SubjectSchema.fields,
        requested: Schema.Boolean,
        includedBy: Schema.Array(
          Schema.Struct({
            kind: Schema.Literals(["pack-member", "shared-output", "shared-package"]),
            source: Schema.String,
          }),
        ),
      }),
    ),
    units: Schema.Array(Schema.String),
    incomplete: Schema.Array(Schema.Struct({ source: Schema.String, reason: Schema.String })),
  }),
  assessments: Schema.Array(CheckAssessmentSchema),
  findings: Schema.Array(Schema.Struct({ id: Schema.String, ...LintJsonFindingSchema.fields })),
  verdict: CheckVerdictSchema,
  officialSkillCompatibility: Schema.optionalKey(AxmSkillCompatibilityReportSchema),
  compatibility: Schema.Array(
    Schema.Struct({
      ...SubjectSchema.fields,
      constraint: Schema.Struct({
        status: Schema.Literals(["compatible", "conflict"]),
        range: Schema.NullOr(Schema.String),
        contributors: Schema.Array(ConstraintContributorSchema),
      }),
      observation: Schema.optionalKey(CanonicalObservationSchema),
      failure: Schema.optionalKey(Schema.String),
    }),
  ),
  projections: Schema.Array(ProjectionEvidenceSchema),
  reconciliation: Schema.Array(
    Schema.Struct({
      key: Schema.optional(Schema.String),
      label: Schema.String,
      readiness: Schema.Literals(["ready", "warn", "error"]),
      message: Schema.optional(Schema.String),
      transitions: Schema.Array(MaterializationTransitionSchema),
      nativeLocations: Schema.Array(NativeLocationOutcomeSchema),
    }),
  ),
  failedOwners: Schema.Array(Schema.String),
}).annotate({
  identifier: "LocalCheckDocument",
  description:
    "Bounded local assessments, evidence coverage and verdict; no repair or acquisition is performed.",
});
export type LocalCheckDocument = typeof LocalCheckDocumentSchema.Type;

export const checkLocal = <LE, LR, CE, CR>(
  request: LocalCheckRequest & { readonly userHome: string },
  owners: LocalCheckOwners<LE, LR, CE, CR>,
) =>
  captureLocalCheck(request, owners).pipe(
    Effect.map((captured): LocalCheckDocument => ({
      checks: request.checks,
      strict: request.strict,
      selection: { scope: captured.selection.scope, requests: captured.selection.requests },
      inspection: captured.inspection,
      scope: captured.scope,
      ...assessCapturedCheck(captured, request),
      ...(captured.officialCompatibility?._tag === "assessed"
        ? {
            officialSkillCompatibility: renderAxmSkillCompatibility(
              captured.officialCompatibility.compatibility,
            ),
          }
        : {}),
      compatibility: (captured.compatibility ?? []).map((entry) => ({
        type: entry.type,
        name: entry.name,
        constraint: Result.isSuccess(entry.constraint)
          ? {
              status: "compatible",
              range: Option.getOrNull(entry.constraint.success.range),
              contributors: entry.constraint.success.contributors,
            }
          : {
              status: "conflict",
              range: null,
              contributors: entry.constraint.failure.contributors,
            },
        ...(Result.isSuccess(entry.observation)
          ? { observation: entry.observation.success }
          : { failure: entry.observation.failure._tag }),
      })),
      projections: captured.projectionFacts.map(({ observation, ...fact }) => {
        const { failure, ...observed } = observation;
        return {
          ...fact,
          observation: { ...observed, ...(failure === undefined ? {} : { failure: failure._tag }) },
        };
      }),
      reconciliation:
        captured.convergence !== undefined && Result.isSuccess(captured.convergence)
          ? captured.convergence.success.steps
          : [],
      failedOwners: captured.failedOwners,
    })),
  );

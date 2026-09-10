/**
 * Decoders for the shared specification contract.
 *
 * Catalog tooling extracts each literal statically; result adapters read the
 * exported constant at run time. Both decode the unknown value through these
 * schemas so every corpus applies one vocabulary with one set of messages.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { formatSchemaIssuesToLines } from "../schema-issues.js";
import {
  EXECUTION_BOUNDARIES,
  EXECUTION_SELECTIONS,
  type ExecutionBinding,
  IDENTITY_SEGMENT_PATTERN,
  type ProductGoalRegistry,
  SPECIFICATION_CLASSES,
  SPECIFICATION_ROLES,
  type BoundEvidenceGate,
  type SpecificationMetadata,
} from "./contract.js";

const REQUIREMENT_IDENTITY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)+$/;

const RequirementIdentitySchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(REQUIREMENT_IDENTITY_PATTERN, {
      title: "Requirement identity",
      message: "Expected two or more lowercase kebab segments joined by '/'",
    }),
  ),
);

const IdentifierSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(IDENTITY_SEGMENT_PATTERN, {
      title: "Identifier",
      message: "Expected a lowercase kebab identifier",
    }),
  ),
);

const SpecificationLimitationSchema = Schema.Struct({
  limitation: Schema.NonEmptyString,
  retirementCondition: Schema.NonEmptyString,
});

const StatedOrUnknownSchema = Schema.Union([
  Schema.Array(Schema.NonEmptyString),
  Schema.Literal("unknown"),
]);

const specificationClasses = SPECIFICATION_CLASSES.map((entry) => entry);
const specificationRoles = SPECIFICATION_ROLES.map((entry) => entry);
const executionBoundaries = EXECUTION_BOUNDARIES.map((entry) => entry);
const executionSelections = EXECUTION_SELECTIONS.map((entry) => entry);

export const SpecificationMetadataSchema = Schema.Struct({
  requirement: RequirementIdentitySchema,
  title: Schema.NonEmptyString,
  statement: Schema.NonEmptyString,
  class: Schema.Literals(specificationClasses),
  characteristic: Schema.optionalKey(IdentifierSchema),
  role: Schema.Literals(specificationRoles),
  goals: Schema.NonEmptyArray(IdentifierSchema),
  boundary: Schema.optionalKey(Schema.Literals(executionBoundaries)),
  boundaryRationale: Schema.optionalKey(Schema.NonEmptyString),
  methods: Schema.NonEmptyArray(IdentifierSchema),
  selection: Schema.optionalKey(Schema.Literals(executionSelections)),
  derivedFrom: Schema.Array(Schema.NonEmptyString),
  supersedes: Schema.Array(Schema.NonEmptyString),
  assumptions: StatedOrUnknownSchema,
  openQuestions: StatedOrUnknownSchema,
  limitations: Schema.optionalKey(Schema.NonEmptyArray(SpecificationLimitationSchema)),
}).pipe(
  Schema.check(
    Schema.makeFilter((metadata: { readonly class: string; readonly characteristic?: string }) =>
      metadata.class === "quality" && metadata.characteristic === undefined
        ? "A quality specification must name the characteristic it measures"
        : undefined,
    ),
    Schema.makeFilter(
      (metadata: { readonly boundary?: string; readonly boundaryRationale?: string }) =>
        (metadata.boundary ?? "memory") !== "memory" && metadata.boundaryRationale === undefined
          ? "A specification observed outside memory must state the evidence that boundary supplies"
          : undefined,
    ),
    Schema.makeFilter((metadata: { readonly supersedes: readonly string[] }) =>
      metadata.supersedes.some(
        (entry) => metadata.supersedes.indexOf(entry) !== metadata.supersedes.lastIndexOf(entry),
      )
        ? "supersedes must not repeat an identity"
        : undefined,
    ),
  ),
);

const ProductGoalDefinitionSchema = Schema.Struct({
  outcome: Schema.NonEmptyString,
  status: Schema.optionalKey(Schema.Literals(["active", "retired"])),
});

export const ProductGoalRegistrySchema = Schema.Record(
  IdentifierSchema,
  ProductGoalDefinitionSchema,
);

export const ExecutionBindingSchema = Schema.Struct({
  requirements: Schema.NonEmptyArray(RequirementIdentitySchema),
  boundary: Schema.Literals(executionBoundaries),
  rationale: Schema.NonEmptyString,
});

const BoundEvidenceGateSchema = Schema.Struct({
  gate: Schema.NonEmptyString,
  verifies: Schema.NonEmptyString,
});

export const BoundEvidenceSchema = Schema.NonEmptyArray(BoundEvidenceGateSchema);

export type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly string[] };

const toDecodeResult = <T>(result: Result.Result<T, Schema.SchemaError>): DecodeResult<T> =>
  Result.isSuccess(result)
    ? { ok: true, value: result.success }
    : { ok: false, issues: formatSchemaIssuesToLines(result.failure.issue) };

/**
 * Metadata is a closed literal: a field the contract does not define is a
 * decoding failure, never ignored.
 */
const decodeMetadata = Schema.decodeUnknownResult(SpecificationMetadataSchema, {
  onExcessProperty: "error",
});
const decodeRegistry = Schema.decodeUnknownResult(ProductGoalRegistrySchema);
const decodeBinding = Schema.decodeUnknownResult(ExecutionBindingSchema);
const decodeEvidence = Schema.decodeUnknownResult(BoundEvidenceSchema);

export const decodeSpecificationMetadata = (value: unknown): DecodeResult<SpecificationMetadata> =>
  toDecodeResult(decodeMetadata(value));

export const decodeProductGoalRegistry = (value: unknown): DecodeResult<ProductGoalRegistry> =>
  toDecodeResult(decodeRegistry(value));

export const decodeExecutionBinding = (value: unknown): DecodeResult<ExecutionBinding> =>
  toDecodeResult(decodeBinding(value));

export const decodeBoundEvidence = (
  value: unknown,
): DecodeResult<readonly [BoundEvidenceGate, ...BoundEvidenceGate[]]> =>
  toDecodeResult(decodeEvidence(value));

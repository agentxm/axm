import * as Schema from "effect/Schema";
import { CheckKindSchema, type CheckKind } from "./check-selection.js";

/** Coverage is evidence about execution, not the condition of the subject. */
export const CheckAssessmentSchema = Schema.Struct({
  kind: CheckKindSchema,
  phase: Schema.String,
  subjectRefs: Schema.Array(Schema.String),
  coverage: Schema.Union([
    Schema.Struct({ state: Schema.Literal("complete") }),
    Schema.Struct({ state: Schema.Literal("incomplete"), reasons: Schema.Array(Schema.String) }),
    Schema.Struct({ state: Schema.Literal("not-requested") }),
    Schema.Struct({ state: Schema.Literal("not-applicable"), reason: Schema.String }),
  ]),
  /** References point to canonical owner findings in this captured document. */
  findingRefs: Schema.Array(Schema.String),
  conclusion: Schema.Literals(["satisfied", "attention-required", "unknown", "not-applicable"]),
});
export type CheckAssessment = typeof CheckAssessmentSchema.Type;

export const CheckVerdictSchema = Schema.Struct({
  ok: Schema.Boolean,
  reasons: Schema.Array(
    Schema.Struct({
      kind: Schema.optionalKey(CheckKindSchema),
      code: Schema.Literals([
        "unresolved-request",
        "missing-assessment",
        "duplicate-assessment",
        "incomplete-assessment",
        "attention-required",
        "error-finding",
        "strict-warning",
        "missing-finding",
      ]),
      refs: Schema.Array(Schema.String),
    }),
  ),
});
export type CheckVerdict = typeof CheckVerdictSchema.Type;

/** Owner findings retain their full payload elsewhere; this is only verdict input. */
export interface CheckFindingVerdict {
  readonly id: string;
  readonly severity: "error" | "warning" | "info";
}

/** One command decision; renderers and completion adapters consume this verdict. */
export const decideCheckVerdict = (args: {
  readonly requested: ReadonlyArray<CheckKind>;
  readonly assessments: ReadonlyArray<CheckAssessment>;
  readonly findings: ReadonlyArray<CheckFindingVerdict>;
  readonly unresolvedRequestRefs: ReadonlyArray<string>;
  readonly strict: boolean;
}): CheckVerdict => {
  const reasons: Array<CheckVerdict["reasons"][number]> = [];
  if (args.unresolvedRequestRefs.length > 0) {
    reasons.push({ code: "unresolved-request", refs: args.unresolvedRequestRefs });
  }
  for (const kind of new Set(args.requested)) {
    const matching = args.assessments.filter((assessment) => assessment.kind === kind);
    if (matching.length !== 1) {
      reasons.push({
        kind,
        code: matching.length === 0 ? "missing-assessment" : "duplicate-assessment",
        refs: [],
      });
      continue;
    }
    for (const assessment of matching) {
      if (
        assessment.coverage.state === "incomplete" ||
        assessment.coverage.state === "not-requested" ||
        assessment.conclusion === "unknown" ||
        (assessment.coverage.state === "not-applicable" &&
          (assessment.coverage.reason.trim() === "" ||
            assessment.conclusion !== "not-applicable")) ||
        (assessment.coverage.state === "complete" && assessment.conclusion === "not-applicable")
      ) {
        reasons.push({ kind, code: "incomplete-assessment", refs: assessment.subjectRefs });
      }
      if (assessment.conclusion === "attention-required") {
        reasons.push({ kind, code: "attention-required", refs: assessment.subjectRefs });
      }
      for (const ref of new Set(assessment.findingRefs)) {
        const finding = args.findings.find((item) => item.id === ref);
        if (finding === undefined) {
          reasons.push({ kind, code: "missing-finding", refs: [ref] });
        } else if (finding.severity === "error") {
          reasons.push({ kind, code: "error-finding", refs: [ref] });
        } else if (finding.severity === "warning" && args.strict) {
          reasons.push({ kind, code: "strict-warning", refs: [ref] });
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
};

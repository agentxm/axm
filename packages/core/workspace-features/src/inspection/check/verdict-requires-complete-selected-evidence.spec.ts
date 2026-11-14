import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decideCheckVerdict, type CheckAssessment } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/check/verdict-requires-complete-selected-evidence",
  title: "Check success requires complete evidence for the selected assessments",
  statement:
    "A local check shall succeed only when every explicit request resolves and every requested applicable assessment has complete evidence with no required attention or error finding, treating warnings as failure only under strict mode and excluding unrequested assessments from the verdict.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The command verdict is evaluated from explicit owner evidence; filesystem freshness, assessment correctness and process exit need separate execution bindings.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const lint: CheckAssessment = {
  kind: "lint",
  phase: "observation-1",
  subjectRefs: ["review"],
  coverage: { state: "complete" },
  findingRefs: [],
  conclusion: "satisfied",
};
const assess = (
  assessments: ReadonlyArray<CheckAssessment>,
  options: Partial<Parameters<typeof decideCheckVerdict>[0]> = {},
) =>
  decideCheckVerdict({
    requested: ["lint"],
    assessments,
    findings: [],
    unresolvedRequestRefs: [],
    strict: false,
    ...options,
  });

describe("Assessment verdict", () => {
  it("distinguishes clean lint from required reconciliation", () => {
    const convergence: CheckAssessment = {
      ...lint,
      kind: "convergence",
      conclusion: "attention-required",
    };
    expect(assess([lint, convergence]).ok).toBe(true);
    expect(assess([lint, convergence], { requested: ["lint", "convergence"] })).toEqual({
      ok: false,
      reasons: [{ kind: "convergence", code: "attention-required", refs: ["review"] }],
    });
  });

  it("does not pass missing, skipped, unknown or incomplete assessment evidence", () => {
    expect(assess([]).ok).toBe(false);
    expect(assess([lint, lint]).ok).toBe(false);
    expect(assess([{ ...lint, coverage: { state: "not-requested" } }]).ok).toBe(false);
    expect(assess([{ ...lint, conclusion: "unknown" }]).ok).toBe(false);
    expect(
      assess([{ ...lint, coverage: { state: "incomplete", reasons: ["unreadable source"] } }]).ok,
    ).toBe(false);
  });

  it("retains warning severity while strict mode changes the verdict", () => {
    const warning = { ...lint, findingRefs: ["warning-1"] };
    const findings = [{ id: "warning-1", severity: "warning" }] satisfies Parameters<
      typeof decideCheckVerdict
    >[0]["findings"];
    expect(assess([warning], { findings }).ok).toBe(true);
    expect(assess([warning], { findings, strict: true }).ok).toBe(false);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("fails errors and missing finding references without treating informational findings as errors", () => {
    const finding = { ...lint, findingRefs: ["finding-1"] };
    expect(assess([finding]).ok).toBe(false);
    expect(assess([finding], { findings: [{ id: "finding-1", severity: "error" }] }).ok).toBe(
      false,
    );
    expect(
      assess([finding], { findings: [{ id: "finding-1", severity: "info" }], strict: true }).ok,
    ).toBe(true);
  });

  it("accepts established non-applicability but not an unexplained exemption", () => {
    const inapplicable: CheckAssessment = {
      ...lint,
      coverage: { state: "not-applicable", reason: "Unowned path has no package to lint" },
      conclusion: "not-applicable",
    };
    expect(assess([inapplicable]).ok).toBe(true);
    expect(
      assess([{ ...inapplicable, coverage: { state: "not-applicable", reason: "" } }]).ok,
    ).toBe(false);
  });

  it("distinguishes a valid empty selection from an unresolved explicit request", () => {
    expect(assess([{ ...lint, subjectRefs: [] }]).ok).toBe(true);
    expect(assess([lint], { unresolvedRequestRefs: ["missing-skill"] }).ok).toBe(false);
  });
});

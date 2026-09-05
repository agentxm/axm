import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { evaluateVerdict } from "../../support/verdict-harness.js";

export const specification = defineSpecification({
  requirement: "system/process/evidence-reports-match-executed-inputs",
  title: "Evidence reports distinguish current execution from incomplete or absent verification",
  statement:
    "When reporting requirement evidence, AXM's repository tools shall identify the executed source and built runtime inputs, observation boundary and selection, distinguishing current complete outcomes from stale, partial, missing, and unverified evidence.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The repository verdict is the review boundary for native test results and separately bound evidence.",
  methods: ["example"],
  derivedFrom: ["scripts/specification-verdict-lib.ts"],
  supersedes: [],
  assumptions: [
    "Installed dependencies match the committed lockfile; repository-wide input matching conservatively invalidates unrelated changes.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Recorded host context establishes only the actual test environment; this report does not infer unobserved platform, human review, external service, or static gate outcomes.",
      retirementCondition:
        "Each such boundary supplies separately attributable execution or assessment evidence.",
    },
  ],
});
describe("Execution evidence at the review boundary", () => {
  it("reports a current complete run with its actual outcome and input provenance", () => {
    expect(evaluateVerdict("report()[0]")).toMatchObject({
      status: "fresh",
      outcome: "passed",
      boundary: "memory",
      selection: "per-change",
      detail: expect.stringContaining("recorded-revision"),
    });
    expect(
      evaluateVerdict(
        "report(fixtureContext({ runs: [fixtureRun({ failed: 1, passed: 2 })] }))[0]",
      ),
    ).toMatchObject({ status: "fresh", outcome: "failed" });
  });
  it.each(["sourceDigest", "runtimeDigest"])("rejects evidence for a previous %s", (input) => {
    expect(
      evaluateVerdict(
        `report(fixtureContext({ inputs: { ...fixtureInputs, ${input}: "changed-input" } }))[0].status`,
      ),
    ).toBe("stale");
  });
  it("rejects an unchanged path whose specification contents differ", () => {
    expect(
      evaluateVerdict('report(fixtureContext(), fixtureSource("new assertion"))[0].status'),
    ).toBe("stale");
  });
  it.each([{ skipped: 1, passed: 2 }, { pending: 1, passed: 2 }, { filtered: true }])(
    "reports incomplete case coverage as partial: %j",
    (file) => {
      expect(
        evaluateVerdict(
          `report(fixtureContext({ runs: [fixtureRun(${JSON.stringify(file)})] }))[0].status`,
        ),
      ).toBe("partial");
    },
  );
  it("does not transfer a passing source result to unexecuted boundaries or human assessments", () => {
    const evidence = evaluateVerdict(`(() => {
      const source = fixtureSource("specification source", { methods: ["example", "review"], selection: "platform-matrix" });
      const boundSource = { ...source, specification: { ...source.specification, boundEvidence: [{ gate: "axm:static-check", verifies: "Checks a repository constraint." }] } };
      return report(fixtureContext({ executionBindings: [{
        source: "packages/cli-e2e/src/install.e2e.test.ts", requirements: [source.specification.metadata.requirement],
        boundary: "process", rationale: "Observes real process output.",
      }] }), boundSource);
    })()`);
    expect(evidence).toEqual([
      expect.objectContaining({ status: "fresh", outcome: "passed", selection: "platform-matrix" }),
      expect.objectContaining({ status: "unverified", boundary: "human assessment" }),
      expect.objectContaining({ status: "missing", boundary: "process" }),
      expect.objectContaining({ status: "missing", boundary: "static gate" }),
    ]);
  });
  it("joins a separately executed boundary only to its declared owning requirement", () => {
    const evidence = evaluateVerdict(`(() => {
      const source = fixtureSource();
      const boundarySource = "packages/cli-e2e/src/install.e2e.test.ts";
      return report(fixtureContext({
        runs: [fixtureRun(), fixtureRun({ source: boundarySource, contentDigest: "boundary-digest" }, { suite: "cli-e2e" })],
        sourceDigests: new Map([[boundarySource, "boundary-digest"]]),
        executionBindings: [{ source: boundarySource, requirements: [source.specification.metadata.requirement], boundary: "process", rationale: "Observes argv and serialized output." }],
      }))[1];
    })()`);
    expect(evidence).toMatchObject({
      source: "packages/cli-e2e/src/install.e2e.test.ts",
      boundary: "process",
      status: "fresh",
      outcome: "passed",
    });
  });
});

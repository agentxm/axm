import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { evaluateVerdict } from "../../support/verdict-harness.js";

export const specification = defineSpecification({
  requirement: "system/process/requirement-diffs-separate-evidence-impact",
  title: "Requirement reports separate changed promises from evidence affected by implementation",
  statement:
    "When reporting a change, AXM's repository tools shall distinguish added, removed, and revised requirement contracts from changed verification or implementation inputs, including affected evidence for requirements whose contracts remain unchanged.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The verdict compares the selected Git baseline to the working tree and presents the distinct review questions.",
  methods: ["example"],
  derivedFrom: ["scripts/specification-verdict-lib.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
describe("Contract changes and evidence impact", () => {
  it("reports additions, removals, and metadata revisions as contract changes", () => {
    expect(
      evaluateVerdict("computeVerdict([], [fixtureSource()], fixtureContext()).affected[0].change"),
    ).toBe("added");
    expect(
      evaluateVerdict("computeVerdict([fixtureSource()], [], fixtureContext()).affected[0].change"),
    ).toBe("removed");
    expect(
      evaluateVerdict(
        'computeVerdict([fixtureSource()], [fixtureSource("source", { title: "A revised promise" })], fixtureContext()).affected[0].change',
      ),
    ).toBe("revised-contract");
  });
  it("reports revised scenarios while preserving the unchanged-contract verdict", () => {
    expect(
      evaluateVerdict(
        'renderVerdictMarkdown(computeVerdict([fixtureSource()], [fixtureSource("revised scenarios")], fixtureContext()))',
      ),
    ).toContain("No requirement contract changes. 1 requirement(s) unchanged.");
  });
  it.each(["packages/cli/src/install.ts", "specifications/support/install-harness.ts"])(
    "reports evidence impact when only %s changes",
    (changed) => {
      const verdict = evaluateVerdict(
        `computeVerdict([fixtureSource()], [fixtureSource()], fixtureContext({ implementationChanges: [${JSON.stringify(changed)}], runs: [] }))`,
      );
      expect(verdict).toMatchObject({
        unchangedCount: 1,
        affected: [
          {
            change: "implementation-impact",
            evidence: [expect.objectContaining({ status: "missing" })],
          },
        ],
      });
    },
  );
});

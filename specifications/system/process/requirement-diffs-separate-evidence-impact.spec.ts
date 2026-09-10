import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { evaluateVerdict } from "../../support/verdict-harness.js";

export const specification = defineSpecification({
  requirement: "system/process/requirement-diffs-separate-evidence-impact",
  title: "Requirement reports separate changed promises from evidence affected by implementation",
  statement:
    "When reporting a change, AXM's repository tools shall distinguish added, removed, revised, and possibly revised requirement contracts from moved files, changed verification coverage, and changed implementation inputs, keying every requirement by its stable identity rather than its path and presenting affected evidence for requirements whose contracts remain unchanged.",
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
        'computeVerdict([fixtureSource()], [fixtureSource(undefined, { title: "A revised promise" })], fixtureContext()).affected[0].change',
      ),
    ).toBe("revised-contract");
  });
  it("reports changed decisive examples as a possible requirement change to review", () => {
    expect(
      evaluateVerdict(
        `renderVerdictMarkdown(computeVerdict([fixtureSource()], [fixtureSource('describe("Install", () => { it("installs the selected extension and its dependencies", () => {}); });')], fixtureContext()))`,
      ),
    ).toContain("Decisive examples changed; review as a possible requirement change");
  });
  it("reports a file moved without change as moved, with identity and history preserved", () => {
    const rendered = evaluateVerdict(
      `renderVerdictMarkdown(computeVerdict([fixtureSource()], [fixtureSource(undefined, {}, { source: "packages/core/extension-lifecycle/src/lifecycle/installs-selected-extension.spec.ts" })], fixtureContext()))`,
    );
    expect(rendered).toContain("No requirement contract changes.");
    expect(rendered).toContain("Moved without change; identity and history preserved:");
  });
  it("reports binding-only body changes as evidence changes that tooling did not review for meaning", () => {
    const rendered = evaluateVerdict(
      `renderVerdictMarkdown(computeVerdict([fixtureSource()], [fixtureSource('describe("Install", () => { const helper = 1; it("installs the selected extension", () => { expect(helper).toBe(1); }); });')], fixtureContext()))`,
    );
    expect(rendered).toContain("No requirement contract changes.");
    expect(rendered).toContain("not reviewed for meaning by tooling");
  });
  it("counts as unchanged only requirements whose metadata, examples, and body are equal", () => {
    expect(
      evaluateVerdict(
        `computeVerdict([fixtureSource()], [fixtureSource('describe("Install", () => { const helper = 1; it("installs the selected extension", () => {}); });')], fixtureContext()).unchangedCount`,
      ),
    ).toBe(0);
  });
  it.each(["apps/cli/src/install.ts", "tools/test-support/src/install-harness.ts"])(
    "reports evidence impact when only %s changes",
    (changed) => {
      const verdict = evaluateVerdict(
        `computeVerdict([fixtureSource()], [fixtureSource()], fixtureContext({ implementationChanges: [${JSON.stringify(changed)}], runs: [] }))`,
      );
      expect(verdict).toMatchObject({
        unchangedCount: 0,
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

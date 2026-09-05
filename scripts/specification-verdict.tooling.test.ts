import { describe, expect, it } from "vitest";
import { parseEvidenceRun } from "./specification-evidence.js";
import {
  fixtureContext,
  fixtureInputs,
  fixtureRun,
  fixtureSource,
} from "./specification-verdict-fixtures.js";
import {
  assessExecutionEvidence,
  computeVerdict,
  renderVerdictMarkdown,
} from "./specification-verdict-lib.js";

const assess = (context = fixtureContext(), source = fixtureSource()) =>
  assessExecutionEvidence(
    source.specification.source,
    source.contentDigest,
    "memory",
    "per-change",
    context,
  );

describe("native execution receipt validation", () => {
  it("decodes a complete receipt and rejects path-only JUnit or inconsistent counts", () => {
    expect(parseEvidenceRun(JSON.stringify(fixtureRun()))).toEqual(fixtureRun());
    expect(
      parseEvidenceRun(
        '<testsuite name="cli/install/installs-selected-extension.spec.ts" tests="3"/>',
      ),
    ).toBeUndefined();
    expect(parseEvidenceRun(JSON.stringify(fixtureRun({ tests: 9 })))).toBeUndefined();
    expect(
      parseEvidenceRun(JSON.stringify({ ...fixtureRun(), inputs: undefined })),
    ).toBeUndefined();
  });

  it("reports no collected tests as missing and collection failure as failed", () => {
    expect(assess(fixtureContext({ runs: [fixtureRun({ tests: 0, passed: 0 })] })).status).toBe(
      "missing",
    );
    expect(
      assess(fixtureContext({ runs: [fixtureRun({ tests: 0, passed: 0, moduleFailed: true })] })),
    ).toMatchObject({ status: "fresh", outcome: "failed" });
  });

  it("does not hide a later failure behind an earlier passing execution", () => {
    const result = assess(
      fixtureContext({
        runs: [
          fixtureRun(),
          fixtureRun({ passed: 2, failed: 1 }, { finishedAt: "2026-09-05T11:00:00Z" }),
        ],
      }),
    );
    expect(result).toMatchObject({ status: "fresh", outcome: "failed" });
  });

  it.each([{ complete: false }, { inputsStable: false }, { unhandledErrors: 1 }])(
    "does not present an interrupted or unstable run as fresh success: %j",
    (run) => {
      expect(assess(fixtureContext({ runs: [fixtureRun({}, run)] })).status).not.toBe("fresh");
    },
  );

  it("uses content identity across an unchanged checkout revision and invalidates rebuilt runtime", () => {
    expect(
      assess(fixtureContext({ inputs: { ...fixtureInputs, revision: "new-commit-same-inputs" } }))
        .status,
    ).toBe("fresh");
    expect(
      assess(fixtureContext({ inputs: { ...fixtureInputs, runtimeDigest: "new-build" } })).status,
    ).toBe("stale");
  });
});

describe("verdict presentation", () => {
  it("distinguishes contract changes from evidence maintenance and implementation impact", () => {
    const base = fixtureSource();
    const contract = computeVerdict(
      [base],
      [fixtureSource("changed", { statement: "AXM shall install dependencies." })],
      fixtureContext(),
    );
    expect(contract.affected[0]?.change).toBe("revised-contract");
    const evidence = renderVerdictMarkdown(
      computeVerdict([base], [fixtureSource("changed")], fixtureContext()),
    );
    expect(evidence).toContain("No requirement contract changes. 1 requirement(s) unchanged.");
    expect(evidence).toContain(
      "Specification evidence changed without changing the requirement contract",
    );
    expect(evidence).not.toContain("Merging accepts");
    expect(
      renderVerdictMarkdown(
        computeVerdict(
          [base],
          [base],
          fixtureContext({ implementationChanges: ["packages/cli/src/install.ts"] }),
        ),
      ),
    ).toContain("Evidence impact conservatively includes all current requirements");
  });

  it("renders removals without inventing execution evidence", () => {
    const verdict = computeVerdict([fixtureSource()], [], fixtureContext());
    expect(verdict.affected).toEqual([
      expect.objectContaining({ change: "removed", evidence: [] }),
    ]);
  });
});

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
  parseDispositionLedger,
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
  it("decodes a complete receipt and rejects path-only JUnit, inconsistent counts, and older formats", () => {
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
    expect(parseEvidenceRun(JSON.stringify({ ...fixtureRun(), format: 1 }))).toBeUndefined();
    const [file] = fixtureRun().files;
    const { purpose: _purpose, ...withoutPurpose } = file ?? {};
    expect(
      parseEvidenceRun(JSON.stringify({ ...fixtureRun(), files: [withoutPurpose] })),
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

  it.each([{ skipped: 1, passed: 2 }, { pending: 1, passed: 2 }, { filtered: true }])(
    "treats a skipped, pending, or filtered execution as partial, never a pass: %j",
    (file) => {
      expect(assess(fixtureContext({ runs: [fixtureRun(file)] })).status).toBe("partial");
    },
  );

  it.each(["test", "e2e", "unlabelled"] as const)(
    "rejects a specification receipt whose file ran with purpose %s",
    (purpose) => {
      const result = assess(fixtureContext({ runs: [fixtureRun({ purpose })] }));
      expect(result).toMatchObject({ status: "missing", outcome: "not-run" });
      expect(result.detail).toContain(`purpose ${purpose}`);
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

describe("requirement change classification", () => {
  const base = fixtureSource();
  const change = (head = base, context = fixtureContext()) =>
    computeVerdict([base], [head], context).affected[0]?.change;

  it("classifies metadata and bound-evidence changes as contract revisions", () => {
    expect(change(fixtureSource(undefined, { statement: "AXM shall install dependencies." }))).toBe(
      "revised-contract",
    );
    const bound = fixtureSource();
    expect(
      change({
        ...bound,
        specification: {
          ...bound.specification,
          boundEvidence: [{ gate: "lint: gate", verifies: "Rejects the violation." }],
        },
      }),
    ).toBe("revised-contract");
  });

  it("classifies a changed decisive example surface as a possible rule revision", () => {
    expect(
      change(
        fixtureSource(
          'describe("Install", () => { it("installs the selected extension and its dependencies", () => {}); });',
        ),
      ),
    ).toBe("possibly-revised-rule");
    expect(
      change(
        fixtureSource(
          'describe("Install", () => { it.each([{ label: "one" }])("installs the selected extension", () => {}); });',
        ),
      ),
    ).toBe("possibly-revised-rule");
  });

  it("classifies a body-only change as revised evidence and formatting as no change", () => {
    expect(
      change(
        fixtureSource(
          'describe("Install", () => { const helper = 1; it("installs the selected extension", () => { expect(helper).toBe(1); }); });',
        ),
      ),
    ).toBe("revised-evidence");
    expect(
      change(
        fixtureSource(
          '// reformatted\ndescribe("Install", () => {\n  it("installs the selected extension", () => {});\n});\n',
        ),
      ),
    ).toBeUndefined();
  });

  it("classifies an unchanged file at a new path as moved, with identity preserved", () => {
    const moved = fixtureSource(
      undefined,
      {},
      {
        owner: "extension-lifecycle",
        source:
          "packages/core/extension-lifecycle/src/lifecycle/installs-selected-extension.spec.ts",
      },
    );
    const verdict = computeVerdict([base], [moved], fixtureContext());
    expect(verdict.affected).toEqual([
      expect.objectContaining({
        requirement: "cli/install/installs-selected-extension",
        change: "moved",
        movedFrom: `extension-lifecycle: ${base.specification.source}`,
        movedTo: `extension-lifecycle: ${moved.specification.source}`,
      }),
    ]);
    expect(verdict.unchangedCount).toBe(0);
    const rendered = renderVerdictMarkdown(verdict);
    expect(rendered).toContain("No requirement contract changes.");
    expect(rendered).toContain("Moved without change; identity and history preserved:");
    expect(rendered).toContain(
      "- `cli/install/installs-selected-extension`: extension-lifecycle: ",
    );
  });

  it("classifies a moved file whose import paths were rewritten as moved", () => {
    const original = fixtureSource(
      'import { install } from "@agentxm/extension-lifecycle";\ndescribe("Install", () => { it("installs the selected extension", () => install()); });',
    );
    const moved = fixtureSource(
      'import { install } from "./install.js";\ndescribe("Install", () => { it("installs the selected extension", () => install()); });',
      {},
      {
        source:
          "packages/core/extension-lifecycle/src/lifecycle/installs-selected-extension.spec.ts",
      },
    );
    expect(computeVerdict([original], [moved], fixtureContext()).affected[0]?.change).toBe("moved");
  });

  it("classifies a moved file with a changed body as revised evidence, not a move", () => {
    const moved = fixtureSource(
      'describe("Install", () => { const x = 1; it("installs the selected extension", () => {}); });',
      {},
      { source: "packages/core/extension-lifecycle/src/other/installs.spec.ts" },
    );
    expect(change(moved)).toBe("revised-evidence");
    expect(renderVerdictMarkdown(computeVerdict([base], [moved], fixtureContext()))).toContain(
      "(also moved:",
    );
  });

  it("counts only entries with no change kind as unchanged", () => {
    const revised = fixtureSource(
      'describe("Install", () => { const x = 1; it("installs the selected extension", () => {}); });',
    );
    const other = fixtureSource(undefined, { requirement: "cli/install/other", title: "Other" });
    const verdict = computeVerdict([base, other], [revised, other], fixtureContext());
    expect(verdict.unchangedCount).toBe(1);
    expect(verdict.affected.map((entry) => entry.change)).toEqual(["revised-evidence"]);
  });

  it("reports implementation impact only for otherwise unchanged requirements", () => {
    const context = fixtureContext({ implementationChanges: ["apps/cli/src/install.ts"] });
    expect(change(base, context)).toBe("implementation-impact");
    const verdict = computeVerdict([base], [base], context);
    expect(verdict.unchangedCount).toBe(0);
    expect(renderVerdictMarkdown(verdict)).toContain(
      "Evidence impact conservatively includes all current requirements",
    );
  });
});

describe("verdict presentation", () => {
  it("distinguishes contract changes from evidence maintenance", () => {
    const base = fixtureSource();
    const contract = renderVerdictMarkdown(
      computeVerdict(
        [base],
        [fixtureSource(undefined, { statement: "AXM shall install dependencies." })],
        fixtureContext(),
      ),
    );
    expect(contract).toContain("Merging accepts these contract changes.");
    expect(contract).toContain("| Revised requirement contract |");
    const examples = renderVerdictMarkdown(
      computeVerdict(
        [base],
        [fixtureSource('describe("Install", () => { it("renamed scenario", () => {}); });')],
        fixtureContext(),
      ),
    );
    expect(examples).toContain(
      "| Decisive examples changed; review as a possible requirement change |",
    );
    expect(examples).toContain("0 requirement(s) unchanged in metadata, examples, and body.");
    const evidence = renderVerdictMarkdown(
      computeVerdict(
        [base],
        [
          fixtureSource(
            'describe("Install", () => { const x = 1; it("installs the selected extension", () => {}); });',
          ),
        ],
        fixtureContext(),
      ),
    );
    expect(evidence).toContain("No requirement contract changes.");
    expect(evidence).toContain(
      "Binding or supporting coverage changed; decisive examples and metadata unchanged — not reviewed for meaning by tooling:",
    );
    expect(evidence).not.toContain("Merging accepts");
  });

  it("renders removals without inventing execution evidence, explained by the ledger or supersession", () => {
    const base = fixtureSource();
    const unexplained = computeVerdict([base], [], fixtureContext());
    expect(unexplained.affected).toEqual([
      expect.objectContaining({ change: "removed", evidence: [] }),
    ]);
    expect(renderVerdictMarkdown(unexplained)).toContain(
      "| Removed requirement — unexplained removal |",
    );
    const ledger = renderVerdictMarkdown(
      computeVerdict(
        [base],
        [],
        fixtureContext({
          dispositions: [
            {
              requirement: base.specification.metadata.requirement,
              disposition: "converted-to-test",
              basis: "Implementation detail with no external standing.",
            },
          ],
        }),
      ),
    );
    expect(ledger).toContain(
      "| Removed requirement — converted to an ordinary test: Implementation detail with no external standing. |",
    );
    const successor = fixtureSource(undefined, {
      requirement: "cli/install/installs-selection",
      title: "Install realizes the selection",
      supersedes: [base.specification.metadata.requirement],
    });
    const superseded = renderVerdictMarkdown(computeVerdict([base], [successor], fixtureContext()));
    expect(superseded).toContain(
      "| Removed requirement — superseded by `cli/install/installs-selection`: The successor declares this identity in `supersedes`. |",
    );
    expect(superseded).toContain("| Added requirement |");
  });

  it("decodes the disposition ledger and rejects a successor-less supersession", () => {
    expect(
      parseDispositionLedger(
        JSON.stringify([
          { requirement: "a/b", disposition: "retired", basis: "No longer promised." },
          { requirement: "a/c", disposition: "superseded-by", successor: "a/d", basis: "Merged." },
        ]),
      ),
    ).toEqual({
      ledger: [
        { requirement: "a/b", disposition: "retired", basis: "No longer promised." },
        { requirement: "a/c", disposition: "superseded-by", successor: "a/d", basis: "Merged." },
      ],
      issues: [],
    });
    expect(
      parseDispositionLedger(
        JSON.stringify([{ requirement: "a/c", disposition: "superseded-by", basis: "Merged." }]),
      ).issues,
    ).toHaveLength(1);
    expect(parseDispositionLedger("not json").issues).toHaveLength(1);
  });
});

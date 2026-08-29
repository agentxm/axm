import { describe, expect, it } from "vitest";

import type { CatalogSpecification } from "./specification-catalog-lib.js";
import {
  computeVerdict,
  digestContent,
  parseJunitOutcomes,
  renderVerdictMarkdown,
  type VerdictSource,
} from "./specification-verdict-lib.js";

const specification = (overrides: Partial<CatalogSpecification>): CatalogSpecification => ({
  requirement: "cli/install/realizes-direct-intent",
  title: "Install realizes directly desired extensions",
  requirementClass: "functional",
  requirementRole: "experience",
  goals: ["extension-adoption"],
  boundary: "memory",
  selection: "per-change",
  methods: [],
  source: "specifications/cli/install/realizes-direct-intent.spec.ts",
  ...overrides,
});

const source = (content: string, overrides: Partial<CatalogSpecification> = {}): VerdictSource => ({
  specification: specification(overrides),
  contentDigest: digestContent(content),
});

const passingJunit = parseJunitOutcomes(
  `<testsuites><testsuite name="cli/install/realizes-direct-intent.spec.ts" tests="3" failures="0" errors="0" skipped="0" time="0.5"></testsuite></testsuites>`,
);

describe("computeVerdict", () => {
  it("reports an added requirement with its evidence", () => {
    const verdict = computeVerdict([], [source("a")], passingJunit);
    expect(verdict.affected).toEqual([
      expect.objectContaining({ change: "added", evidence: "passed" }),
    ]);
  });

  it("reports a removed requirement", () => {
    const verdict = computeVerdict([source("a")], [], new Map());
    expect(verdict.affected).toEqual([expect.objectContaining({ change: "removed" })]);
  });

  it("distinguishes contract revisions from evidence revisions", () => {
    const contractChange = computeVerdict(
      [source("a")],
      [source("a", { title: "Install realizes every directly desired extension" })],
      passingJunit,
    );
    expect(contractChange.affected).toEqual([
      expect.objectContaining({ change: "revised-contract" }),
    ]);

    const evidenceChange = computeVerdict([source("a")], [source("b")], passingJunit);
    expect(evidenceChange.affected).toEqual([
      expect.objectContaining({ change: "revised-evidence" }),
    ]);
  });

  it("never rolls missing evidence up as a pass", () => {
    const verdict = computeVerdict([], [source("a")], new Map());
    expect(verdict.affected[0]?.evidence).toBe("missing");
    const failed = parseJunitOutcomes(
      `<testsuites><testsuite name="cli/install/realizes-direct-intent.spec.ts" tests="3" failures="1" errors="0" skipped="0"></testsuite></testsuites>`,
    );
    expect(computeVerdict([], [source("a")], failed).affected[0]?.evidence).toBe("failed");
  });

  it("counts unchanged requirements without listing them", () => {
    const verdict = computeVerdict([source("a")], [source("a")], passingJunit);
    expect(verdict.affected).toEqual([]);
    expect(verdict.unchangedCount).toBe(1);
  });
});

describe("renderVerdictMarkdown", () => {
  it("renders the requirement diff in product language", () => {
    const verdict = computeVerdict([], [source("a")], new Map());
    const markdown = renderVerdictMarkdown(verdict);
    expect(markdown).toContain("requirements");
    expect(markdown).toContain("Install realizes directly desired extensions");
    expect(markdown).toContain("missing");
  });
});

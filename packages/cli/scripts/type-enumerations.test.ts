import { describe, expect, it } from "vitest";

import {
  buildRegionBlocks,
  CLOSE_MARKER,
  openMarker,
  rewriteManagedRegions,
  stripRegionMarkers,
  type TypeEnumerationRow,
} from "./type-enumerations.js";

const skill: TypeEnumerationRow = {
  plural: "skills",
  pluralLabel: "Skills",
  pluralSentenceLabel: "skills",
  summary: "Package reusable agent skills.",
  standard: { name: "Agent Skills", url: "https://agentskills.io" },
};

const rule: TypeEnumerationRow = {
  plural: "rules",
  pluralLabel: "Rules",
  pluralSentenceLabel: "rules",
  summary: "Sync instruction files.",
  standard: null,
};

const pack: TypeEnumerationRow = {
  plural: "packs",
  pluralLabel: "Packs",
  pluralSentenceLabel: "packs",
  summary: null,
  standard: null,
};

const rows = [skill, rule, pack];

const document = (region: Parameters<typeof openMarker>[0]): string =>
  `# Title\n\nIntro paragraph.\n\n${openMarker(region)}\n\nstale content\n\n${CLOSE_MARKER}\n\nOutro.\n`;

describe("region blocks", () => {
  it("renders one table row per catalog-described type, with its standard", () => {
    const table = buildRegionBlocks(rows)["extension-types-table"];

    expect(table).toContain(
      "| **Skills** | Package reusable agent skills. | [Agent Skills](https://agentskills.io) |",
    );
    expect(table).toContain("| **Rules** | Sync instruction files. | — |");
    // Packs carry no catalog summary, so the table has nothing to say about them.
    expect(table).not.toContain("Packs");
  });

  it("lists a command namespace for every type", () => {
    const blocks = buildRegionBlocks(rows);

    expect(blocks["extension-type-namespaces"]).toContain("`axm skills`, `axm rules`, `axm packs`");
    expect(blocks["extension-type-namespace-set"]).toBe("`<type>` ∈ {`skills`, `rules`, `packs`}");
  });

  it("enumerates every type in the prose list, workspace capabilities included", () => {
    expect(buildRegionBlocks(rows)["extension-type-list"]).toBe(
      "AXM manages skills, rules, and packs.",
    );
  });

  it("grows the generated blocks when the catalog gains a type", () => {
    const before = buildRegionBlocks(rows);
    const after = buildRegionBlocks([
      ...rows,
      {
        plural: "widgets",
        pluralLabel: "Widgets",
        pluralSentenceLabel: "widgets",
        summary: "A tenth type.",
        standard: null,
      },
    ]);

    expect(after["extension-types-table"]).not.toBe(before["extension-types-table"]);
    expect(after["extension-type-list"]).not.toBe(before["extension-type-list"]);
    expect(after["extension-type-namespaces"]).not.toBe(before["extension-type-namespaces"]);
    expect(after["extension-type-namespace-set"]).not.toBe(before["extension-type-namespace-set"]);
  });
});

describe("managed region rewriting", () => {
  it("replaces only the region body and reports what it touched", () => {
    const blocks = buildRegionBlocks(rows);
    const { content, regions } = rewriteManagedRegions(document("extension-type-list"), blocks);

    expect(regions).toEqual(["extension-type-list"]);
    expect(content).toContain("Intro paragraph.");
    expect(content).toContain("Outro.");
    expect(content).toContain(blocks["extension-type-list"]);
    expect(content).not.toContain("stale content");
  });

  it("leaves a document that opens no region untouched", () => {
    const source = "# Title\n\nNothing generated here.\n";

    expect(rewriteManagedRegions(source, buildRegionBlocks(rows))).toEqual({
      content: source,
      regions: [],
    });
  });

  it("refuses an unterminated region rather than guessing where the body ends", () => {
    const source = `${openMarker("extension-type-list")}\n\nbody\n`;

    expect(() => rewriteManagedRegions(source, buildRegionBlocks(rows))).toThrow(
      /missing its <!-- \/axm:generated --> marker/,
    );
  });

  it("refuses a region opened twice", () => {
    const open = openMarker("extension-type-list");
    const source = `${open}\n\nbody\n\n${CLOSE_MARKER}\n\n${open}\n\nbody\n\n${CLOSE_MARKER}\n`;

    expect(() => rewriteManagedRegions(source, buildRegionBlocks(rows))).toThrow(
      /opened more than once/,
    );
  });
});

describe("marker stripping", () => {
  it("removes marker lines without leaving stacked blank lines", () => {
    const { content } = rewriteManagedRegions(
      document("extension-type-list"),
      buildRegionBlocks(rows),
    );
    const stripped = stripRegionMarkers(content);

    expect(stripped).not.toContain("axm:generated");
    expect(stripped).not.toMatch(/\n{3,}/);
    expect(stripped).toContain("AXM manages skills, rules, and packs.");
  });
});

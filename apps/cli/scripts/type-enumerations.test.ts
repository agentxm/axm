import { describe, expect, it } from "vitest";

import { REGION_NAMES } from "@agentxm/workspace-kernel/agent-adapters";

import {
  BUILD_TIME_REGION_NAMES,
  buildRegionBlocks,
  rewriteManagedRegions,
  stripRegionMarkers,
  type BuildTimeRegionName,
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

const open = (region: BuildTimeRegionName): string => `<!-- axm:${region} -->`;
const close = (region: BuildTimeRegionName): string => `<!-- /axm:${region} -->`;

const document = (region: BuildTimeRegionName): string =>
  `# Title\n\nIntro paragraph.\n\n${open(region)}\n\nstale content\n\n${close(region)}\n\nOutro.\n`;

describe("build-time region names", () => {
  it("never collide with the regions AXM writes into a workspace", () => {
    const runtime: ReadonlySet<string> = new Set(REGION_NAMES);

    expect(BUILD_TIME_REGION_NAMES.filter((name) => runtime.has(name))).toEqual([]);
  });
});

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
    const source = `${open("extension-type-list")}\n\nbody\n`;

    expect(() => rewriteManagedRegions(source, buildRegionBlocks(rows))).toThrow(
      /missing its <!-- \/axm:extension-type-list --> marker/,
    );
  });

  it("does not accept another region's closing fence", () => {
    const source = `${open("extension-type-list")}\n\nbody\n\n${close("extension-types-table")}\n`;

    expect(() => rewriteManagedRegions(source, buildRegionBlocks(rows))).toThrow(
      /missing its <!-- \/axm:extension-type-list --> marker/,
    );
  });

  it("ignores fences shown inside a fenced code block", () => {
    const source = `# Title\n\n\`\`\`md\n${open("extension-type-list")}\n\`\`\`\n`;

    expect(rewriteManagedRegions(source, buildRegionBlocks(rows))).toEqual({
      content: source,
      regions: [],
    });
  });

  it("refuses a region opened twice", () => {
    const fenced = `${open("extension-type-list")}\n\nbody\n\n${close("extension-type-list")}\n`;
    const source = `${fenced}\n${fenced}`;

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

    expect(stripped).not.toContain("axm:");
    expect(stripped).not.toMatch(/\n{3,}/);
    expect(stripped).toContain("AXM manages skills, rules, and packs.");
  });

  it("keeps fences that do not name a build-time region", () => {
    const source = "Intro.\n\n<!-- axm:rules -->\n\nbody\n\n<!-- /axm:rules -->\n";

    expect(stripRegionMarkers(source)).toBe(source);
  });
});

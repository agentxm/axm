import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { plain, type Doc, type LedgerColumn, type LedgerRow } from "./doc.js";
import { paintText } from "./paint-text.js";
import { truncateDisplay } from "./width.js";

export const specification = defineSpecification({
  requirement: "cli/names-yield-width-last",
  title: "A name gives way last, and keeps what tells it apart",
  statement:
    "A ledger shall shorten a unit's name only when the line has no width left to give it, and a name it must shorten shall keep its final segment and its type segment, giving up scope characters first.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "Layout is a pure function of a document and a terminal width, so the whole obligation is decided in memory.",
  methods: ["example"],
  derivedFrom: ["cli/ledger-width-relocates-values"],
  supersedes: [],
  assumptions: [
    "Extension names are single path segments, so the segment after the last separator is the name itself.",
  ],
  openQuestions: [],
});

const COLUMNS: ReadonlyArray<LedgerColumn> = [
  { header: "Extension", role: "name" },
  { header: "Version", role: "fixed", priority: "preferred" },
  { header: "Status", role: "fixed", priority: "required" },
  { header: "Detail", role: "elastic", priority: "optional" },
];

const row = (name: string, detail: string): LedgerRow => ({
  id: name,
  mark: "update",
  cells: [name, "1.4.0", "updated", detail],
});

const ledgerOf = (rows: ReadonlyArray<LedgerRow>): Doc => [
  { _tag: "ledger", columns: COLUMNS, rows },
];

const LONG = "@acme-enterprise/knowledge/effect-v4";
const SHORT = "@acme/skills/triage";

describe("A name yields width last", () => {
  it("shows every name whole while the line has width to give", () => {
    const lines = paintText(ledgerOf([row(LONG, "12 files"), row(SHORT, "3 files")]), {
      width: 100,
      colors: false,
    });
    expect(lines.join("\n")).toContain(LONG);
    expect(lines.join("\n")).toContain(SHORT);
  });

  it("shows every name whole even where an elastic column would rather have the width", () => {
    // The detail column can wrap onto more lines; the name cannot, so the
    // width goes to the name and the prose wraps.
    const wordy =
      "the registry did not answer within thirty seconds and the workspace was left as it was";
    const lines = paintText(ledgerOf([row(LONG, wordy), row(SHORT, wordy)]), {
      width: 100,
      colors: false,
    });
    expect(lines.join("\n")).toContain(LONG);
    expect(lines.join("\n")).toContain(SHORT);
  });

  it("keeps the type segment and the name when it must shorten a scope", () => {
    const shortened = truncateDisplay(LONG, 30, "middle");
    expect(shortened).toContain("/knowledge/effect-v4");
    expect(shortened.startsWith("@acme")).toBe(true);
    expect(shortened).not.toBe(LONG);
  });

  it("gives up scope characters before it gives up a segment", () => {
    expect(truncateDisplay("@acme-enterprise/skills/audits/soc2-review", 40, "middle")).toBe(
      "@acme-enterpr…/skills/audits/soc2-review",
    );
  });

  it("identifies every row of one ledger in the same form", () => {
    const lines = paintText(ledgerOf([row(LONG, ""), row(SHORT, "")]), {
      width: 60,
      colors: false,
    });
    const names = lines
      .slice(1)
      .map((line) => line.slice(5).split(/\s{2,}/u)[0] ?? "")
      .filter((name) => name.length > 0);
    expect(names.length).toBeGreaterThan(1);
    for (const name of names) expect(name).toMatch(/\//u);
  });

  it("never paints a name wider than the terminal", () => {
    for (const width of [40, 60, 80, 100, 120]) {
      for (const line of paintText(ledgerOf([row(LONG, "12 files")]), { width, colors: false })) {
        expect(plain(line).length, `${String(width)}: ${line}`).toBeLessThanOrEqual(width);
      }
    }
  });
});

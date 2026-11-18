import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { plain, type Doc, type TableColumn, type TableRow } from "./doc.js";
import { paintText } from "./paint-text.js";

export const specification = defineSpecification({
  requirement: "cli/tables-keep-rows-scannable",
  title: "A read-only table keeps each row on one line before it keeps an extra column",
  statement:
    "When a read-only table does not fit the available width, it shall give up its optional columns before it wraps any cell, shall never wrap its name column but shorten each name in the middle only when nothing else can give way, shall set its rows apart with a blank line whenever any row spans more than one line, and shall name the columns it hid on a line set apart from its rows that says how to see them.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "Table layout is a pure function of a document and a terminal width, so the whole obligation is decided in memory.",
  methods: ["example"],
  derivedFrom: ["cli/names-yield-width-last", "cli/ascii-human-output-preserves-content"],
  supersedes: [],
  assumptions: [
    "A name column's cells are identifiers a reader scans down, so a name split across lines reads as two rows.",
  ],
  openQuestions: [],
});

const tableOf = (columns: ReadonlyArray<TableColumn>, rows: ReadonlyArray<TableRow>): Doc => [
  { _tag: "table", columns, rows },
];

const paint = (doc: Doc, width: number): ReadonlyArray<string> =>
  paintText(doc, { width, colors: false });

const INVENTORY = tableOf(
  [
    { header: "Extension", role: "name", priority: "required" },
    { header: "State" },
    { header: "Version" },
    { header: "Configured agents", priority: "optional" },
  ],
  [
    { cells: ["@acme/subagents/reviewer", "managed by this workspace", "0.9.0", "claude-code"] },
    { cells: ["@acme/skills/triage", "managed by this workspace", "2.0.1", "claude-code"] },
  ],
);

describe("Read-only tables keep rows scannable", () => {
  it("gives up an optional column before it wraps any cell", () => {
    // Every column but the optional one fits whole at 80 columns.
    const lines = paint(INVENTORY, 80);
    expect(lines.slice(0, 3)).toEqual([
      "     Extension                  State                       Version",
      "     @acme/subagents/reviewer   managed by this workspace   0.9.0",
      "     @acme/skills/triage        managed by this workspace   2.0.1",
    ]);
  });

  it("wraps other columns, never a name, while they can give way", () => {
    const lines = paint(INVENTORY, 56);
    const names = lines.filter((line) => line.includes("@acme"));
    expect(names.map((line) => line.trim().split(/\s{2,}/u)[0])).toEqual([
      "@acme/subagents/reviewer",
      "@acme/skills/triage",
    ]);
    // The State cell gives way onto a second line instead.
    expect(lines.some((line) => line.trim() === "this workspace")).toBe(true);
  });

  it("shortens a name in the middle, keeping its last segment, once nothing else can give way", () => {
    const lines = paint(
      tableOf(
        [
          { header: "Extension", role: "name", priority: "required" },
          { header: "Type", priority: "required" },
        ],
        [{ cells: ["@acme-enterprise/subagents/security-reviewer", "subagent"] }],
      ),
      48,
    );
    const row = lines.find((line) => line.includes("subagent ") || line.endsWith("subagent")) ?? "";
    expect(row).toContain("…");
    expect(row).toContain("/security-reviewer");
    expect(lines.every((line) => plain(line).length <= 48)).toBe(true);
    expect(lines.filter((line) => line.trim().length > 0)).toHaveLength(2);
  });

  it("sets rows apart once any row spans more than one line", () => {
    const lines = paint(INVENTORY, 56);
    const second = lines.findIndex((line) => line.includes("@acme/skills/triage"));
    expect(lines[second - 1]).toBe("");
    expect(paint(INVENTORY, 80).slice(0, 3)).not.toContain("");
  });

  it("names what it hid apart from its rows, and how to see it", () => {
    const lines = paint(INVENTORY, 80);
    const note = lines.findIndex((line) => line.includes("Not shown at this width"));
    expect(lines[note - 1]).toBe("");
    expect(lines.slice(note).join(" ")).toMatch(/Configured agents\. A wider terminal shows it\./u);
  });
});

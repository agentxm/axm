import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { plain, type Doc } from "./doc.js";
import { inventoryDoc, type ViewColumn } from "./view.js";

export const specification = defineSpecification({
  requirement: "cli/inventories-state-uniform-columns-once",
  title: "An inventory states a value every row shares once, in its summary",
  statement:
    "When every row of an inventory with two or more rows holds the same value in a column whose view states a shared form, the inventory shall omit that column from its table and shall state that form once in its summary, after the inventory's own facts and before what needs attention.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "An inventory document is a pure function of its rows and columns, so the whole obligation is decided in memory.",
  methods: ["example"],
  derivedFrom: ["cli/tables-keep-rows-scannable"],
  supersedes: [],
  assumptions: [
    "A view may state no shared form for a value that goes without saying, such as observing nothing; the column still leaves the table.",
  ],
  openQuestions: [],
});

interface Row {
  readonly name: string;
  readonly agents: string;
}

const COLUMNS: ReadonlyArray<ViewColumn<Row>> = [
  { header: "Name", role: "name", priority: "required", value: (row) => row.name },
  {
    header: "Agents",
    value: (row) => row.agents,
    whenUniform: (row) => `configured for ${row.agents}`,
  },
];

const inventory = (rows: ReadonlyArray<Row>): Doc =>
  inventoryDoc({
    rows,
    columns: COLUMNS,
    summary: [`${String(rows.length)} skills`],
    summaryTail: ["1 needs attention"],
    empty: "No skills.",
  });

const tableHeaders = (doc: Doc): ReadonlyArray<string> =>
  doc.flatMap((node) =>
    node._tag === "table" ? node.columns.map((column) => plain(column.header)) : [],
  );

const summaryParts = (doc: Doc): ReadonlyArray<string> =>
  doc.flatMap((node) =>
    node._tag === "summary" ? node.parts.map((part) => plain(part.text)) : [],
  );

describe("Inventories state a shared value once", () => {
  it("moves a column every row shares into the summary, before what needs attention", () => {
    const doc = inventory([
      { name: "review", agents: "claude-code" },
      { name: "triage", agents: "claude-code" },
    ]);
    expect(tableHeaders(doc)).toEqual(["Name"]);
    expect(summaryParts(doc)).toEqual([
      "2 skills",
      "configured for claude-code",
      "1 needs attention",
    ]);
  });

  it("keeps a column whose rows differ", () => {
    const doc = inventory([
      { name: "review", agents: "claude-code" },
      { name: "triage", agents: "codex" },
    ]);
    expect(tableHeaders(doc)).toEqual(["Name", "Agents"]);
    expect(summaryParts(doc)).toEqual(["2 skills", "1 needs attention"]);
  });

  it("keeps the column of a single row, which shares nothing with another", () => {
    const doc = inventory([{ name: "review", agents: "claude-code" }]);
    expect(tableHeaders(doc)).toEqual(["Name", "Agents"]);
  });
});

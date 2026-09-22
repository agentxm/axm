import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { plain, type Doc, type LedgerColumn, type LedgerRow, type Text } from "./doc.js";
import { paintText, type PaintWidth } from "./paint-text.js";

export const specification = defineSpecification({
  requirement: "cli/ledger-width-relocates-values",
  title: "A ledger moves a value it cannot lay out; it never removes one",
  statement:
    "When an operation ledger cannot lay a column out at the available width, each non-empty value of that column shall appear beneath its own row, so that no value present at a wider width is absent at a narrower one; a value marked as one a person copies shall appear whole, never cut, split, or hyphenated, on a line of its own where it does not fit beside its row.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "The painter is a pure function from a document and a terminal width to lines, so the whole obligation is decided in memory.",
  methods: ["property", "example"],
  derivedFrom: [
    "cli/ascii-human-output-preserves-content",
    "cli/non-tty-output-is-plain-and-unpadded",
  ],
  supersedes: [],
  assumptions: [
    "A ledger's protected name column is shortened in the middle rather than relocated, which `cli/names-yield-width-last` owns; this obligation covers every other column.",
  ],
  openQuestions: [],
});

/** Every width a supported terminal takes, and the stream that has none. */
const WIDTHS: ReadonlyArray<PaintWidth> = [40, 60, 80, 100, 120, 200, "unbounded"];

const COLUMNS: ReadonlyArray<LedgerColumn> = [
  { header: "Extension", role: "name" },
  { header: "Version", role: "fixed", priority: "preferred" },
  { header: "Status", role: "fixed", priority: "required" },
  { header: "Detail", role: "elastic", priority: "optional" },
];

const ROWS: ReadonlyArray<LedgerRow> = [
  {
    id: "@acme/skills/incident-review",
    mark: "update",
    cells: [
      "@acme/skills/incident-review",
      "2.0.0",
      "updated",
      "from 1.9.4, 42 files, /home/dev/work/platform-services/agent_extensions/incident-review",
    ],
  },
  {
    id: "@acme-enterprise/knowledge/effect-v4",
    mark: "failed",
    cells: [
      "@acme-enterprise/knowledge/effect-v4",
      "0.4.2",
      "failed",
      "from 0.4.2, /home/dev/work/platform-services/agent_extensions/effect-v4",
    ],
    reason: "The archive does not match the integrity the lockfile records.",
  },
];

const ledger: Doc = [{ _tag: "ledger", columns: COLUMNS, rows: ROWS }];

/**
 * The painted document with its whitespace removed. Where a value landed is
 * the painter's business; that every character of it is there is this
 * specification's.
 */
const compact = (value: string): string => value.replaceAll(/\s+/gu, "");

const paintedAt = (doc: Doc, width: PaintWidth): string =>
  compact(paintText(doc, { width, colors: false }).join("\n"));

/** Every cell a row carries except the protected name column's. */
const relocatableCells = (row: LedgerRow): ReadonlyArray<Text> =>
  row.cells.flatMap((cell, index) => (index === 0 || plain(cell).length === 0 ? [] : [cell]));

describe("Width relocates a ledger value", () => {
  it("keeps every value of every column at every width", () => {
    for (const width of WIDTHS) {
      const painted = paintedAt(ledger, width);
      for (const row of ROWS) {
        for (const cell of relocatableCells(row)) {
          expect(painted, `${String(width)}: ${plain(cell)}`).toContain(compact(plain(cell)));
        }
        if (row.reason !== undefined) {
          expect(painted, `${String(width)}: reason`).toContain(compact(plain(row.reason)));
        }
      }
    }
  });

  it("loses nothing at a narrower width that a wider one showed", () => {
    const widest = paintedAt(ledger, "unbounded");
    const values = ROWS.flatMap((row) => relocatableCells(row).map((cell) => compact(plain(cell))));
    for (const value of values) expect(widest).toContain(value);
    for (const width of WIDTHS) {
      const painted = paintedAt(ledger, width);
      for (const value of values) expect(painted, String(width)).toContain(value);
    }
  });

  it("shows a value a person copies whole, on a line of its own", () => {
    const command =
      "axm update @acme-enterprise/knowledge/effect-v4 --refresh --ignore-release-age";
    const withCommand: Doc = [
      {
        _tag: "ledger",
        columns: COLUMNS,
        rows: [
          {
            id: "@acme-enterprise/knowledge/effect-v4",
            mark: "failed",
            cells: [
              "@acme-enterprise/knowledge/effect-v4",
              "0.4.2",
              "failed",
              [{ text: command, copyable: true }],
            ],
          },
        ],
      },
    ];
    for (const width of WIDTHS) {
      const lines = paintText(withCommand, { width, colors: false });
      expect(
        lines.some((line) => line.includes(command)),
        `${String(width)} cut a copyable value`,
      ).toBe(true);
    }
  });
});

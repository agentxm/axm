import { describe, expect, it } from "vitest";

import type { Doc, TableColumn } from "./doc.js";
import { stripTerminalFormatting } from "./output-policy.js";
import { asciiGlyphs, paintText, type PaintStyle } from "./paint-text.js";
import { displayWidth } from "./width.js";

const document: Doc = [
  { _tag: "headline", tone: "ok", text: "Installed 2 skills" },
  { _tag: "blank" },
  {
    _tag: "rows",
    rows: [
      { _tag: "row", change: "create", cells: ["deploy", "1.4.0", "created"] },
      { _tag: "row", change: "unchanged", cells: ["rollback", "0.9.2", "already installed"] },
    ],
  },
  {
    _tag: "collapsed",
    change: "unchanged",
    count: 4,
    noun: "skills unchanged",
    hint: "--verbose to list",
  },
  {
    _tag: "next",
    actions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
  },
];

const everyNodeDocument: Doc = [
  { _tag: "headline", tone: "ok", text: "Ready" },
  { _tag: "paragraph", text: "部署 package is ready for review" },
  { _tag: "row", change: "create", cells: ["alpha", "created"] },
  {
    _tag: "rows",
    rows: [{ _tag: "row", change: "update", cells: ["beta", "updated"] }],
  },
  { _tag: "collapsed", change: "unchanged", count: 2, noun: "unchanged" },
  {
    _tag: "callout",
    tone: "warn",
    title: "Warning",
    children: [{ _tag: "paragraph", text: "Check permissions" }],
  },
  {
    _tag: "table",
    caption: "Inventory",
    columns: [{ header: "Name" }, { header: "State" }],
    rows: [["alpha", "ready"]],
  },
  { _tag: "fields", fields: [{ label: "Owner", value: "@acme" }] },
  {
    _tag: "tree",
    roots: [
      {
        text: "root",
        detail: "managed",
        children: [{ text: "child" }],
      },
    ],
  },
  {
    _tag: "next",
    actions: [{ description: "Inspect", cmd: "axm list" }],
  },
  { _tag: "summary", tone: "ok", parts: [{ text: "1 changed" }], elapsedMs: 1200 },
  {
    _tag: "section",
    title: "Details",
    children: [{ _tag: "paragraph", text: "Section body" }],
  },
  { _tag: "markdown", content: "# Heading" },
  { _tag: "raw", content: "pre-sanitized" },
  { _tag: "blank" },
];

const skillColumns: ReadonlyArray<TableColumn> = [
  { header: "Name", priority: "required" },
  { header: "State" },
  { header: "Activation" },
  { header: "Type" },
  { header: "Agents" },
  { header: "Agent outcomes", priority: "optional" },
];

const skillRows: ReadonlyArray<ReadonlyArray<string>> = [
  [
    "@craigsmitham/effect-v4",
    "installed",
    "enabled",
    "registry",
    "claude-code, codex, cursor, gemini-cli",
    "claude-code:projected, codex:projected, cursor:projected, gemini-cli:projected",
  ],
  [
    "@craigsmitham/field-notes",
    "installed",
    "enabled",
    "registry",
    "claude-code, codex",
    "claude-code:projected, codex:current",
  ],
  ["local-notes", "detected", "n/a", "detected", "none", "none"],
];

const skillsList: Doc = [
  {
    _tag: "table",
    columns: skillColumns,
    rows: skillRows,
    caption: "3 skills (2 configured, 0 implicit, 2 installed, 1 unmanaged)",
  },
];

const plain = (doc: Doc, width: PaintStyle["width"]) => paintText(doc, { width, colors: false });

const widest = (lines: ReadonlyArray<string>) => Math.max(0, ...lines.map(displayWidth));

describe("paintText", () => {
  it("paints the document grammar without color", () => {
    expect(plain(document, 80)).toEqual([
      "✔ Installed 2 skills",
      "",
      "+ deploy     1.4.0   created",
      "= rollback   0.9.2   already installed",
      "= 4 skills unchanged  --verbose to list",
      "Next",
      "  Inspect installed skills · axm skills list",
    ]);
  });

  it("uses ANSI only when color is enabled", () => {
    const colored = paintText([{ _tag: "headline", tone: "warn", text: "Careful" }], {
      width: 40,
      colors: true,
    }).join("\n");
    expect(colored).toContain("\u001b[33m");
    expect(colored).toContain("Careful");
  });

  it("stacks a change row that cannot fit a narrow terminal", () => {
    const lines = plain(
      [
        {
          _tag: "row",
          change: "update",
          cells: ["skill", "a very long destination that cannot fit"],
        },
      ],
      24,
    );
    expect(lines).toEqual(["~ skill", "  a very long", "  destination that", "  cannot fit"]);
    expect(widest(lines)).toBeLessThanOrEqual(24);
  });

  it("paints every node kind as one stable wide document", () => {
    expect(plain(everyNodeDocument, 80)).toEqual([
      "✔ Ready",
      "部署 package is ready for review",
      "+ alpha   created",
      "~ beta   updated",
      "= 2 unchanged",
      "▲ Warning",
      "  Check permissions",
      "Inventory",
      "  Name    State",
      "  alpha   ready",
      "Owner  @acme",
      "└─ root  managed",
      "   └─ child",
      "Next",
      "  Inspect · axm list",
      "1 changed in 1.2s",
      "Details",
      "  Section body",
      "# Heading",
      "pre-sanitized",
      "",
    ]);
  });

  it.each([32, 80])(
    "keeps the same document semantics at width %i with color on and off",
    (width) => {
      const plainText = plain(everyNodeDocument, width).join("\n");
      const colored = paintText(everyNodeDocument, { width, colors: true }).join("\n");

      expect(stripTerminalFormatting(colored)).toBe(plainText);
      expect(colored).toContain("\u001b[");
      expect(plainText).toContain("部署 package");
      expect(plainText).toContain("pre-sanitized");
    },
  );

  it("wraps wide-character paragraphs at narrow widths", () => {
    expect(
      plain([{ _tag: "paragraph", text: "部署 package has a continuation that must wrap" }], 24),
    ).toEqual(["部署 package has a", "continuation that must", "wrap"]);
  });

  it("keeps span styling across wrapped lines", () => {
    const lines = paintText(
      [
        {
          _tag: "paragraph",
          text: [
            { text: "Installed " },
            { text: "@craigsmitham/effect-v4", tone: "ok", bold: true },
            { text: " into every configured agent" },
          ],
        },
      ],
      { width: 30, colors: true },
    );
    expect(lines.map(stripTerminalFormatting)).toEqual([
      "Installed",
      "@craigsmitham/effect-v4 into",
      "every configured agent",
    ]);
    expect(lines[1]).toContain("\u001b[1m\u001b[32m@craigsmitham/effect-v4\u001b[0m");
  });

  it.each([40, 80, 120, 200])("never paints a line wider than %i columns", (width) => {
    const lines = plain(everyNodeDocument, width);
    for (const line of lines) {
      if (line === "# Heading" || line === "pre-sanitized") continue;
      expect(displayWidth(line), line).toBeLessThanOrEqual(width);
    }
  });

  describe("responsive tables", () => {
    it("aligns headers with cells and fits a six-column inventory into 100 columns", () => {
      const lines = plain(skillsList, 100);
      expect(widest(lines)).toBeLessThanOrEqual(100);
      const header = lines[1] ?? "";
      const firstRow = lines[2] ?? "";
      expect(header.indexOf("State")).toBe(firstRow.indexOf("installed"));
      expect(header.indexOf("Activation")).toBe(firstRow.indexOf("enabled"));
      expect(header.indexOf("Agents")).toBe(firstRow.indexOf("claude-code, codex"));
      expect(lines).toEqual([
        "3 skills (2 configured, 0 implicit, 2 installed, 1 unmanaged)",
        "  Name                        State       Activation   Type       Agents",
        "  @craigsmitham/effect-v4     installed   enabled      registry   claude-code, codex, cursor,",
        "                                                                  gemini-cli",
        "  @craigsmitham/field-notes   installed   enabled      registry   claude-code, codex",
        "  local-notes                 detected    n/a          detected   none",
        "  Not shown at this width: Agent outcomes",
      ]);
    });

    it("shows every column at a wide terminal, wrapping only where needed", () => {
      const lines = plain(skillsList, 200);
      expect(widest(lines)).toBeLessThanOrEqual(200);
      expect(lines.some((line) => line.includes("Not shown"))).toBe(false);
      expect(lines[1]).toContain("Agent outcomes");
      expect(lines[2]).toContain("gemini-cli:projected");
    });

    it("shrinks and wraps the widest columns before hiding any", () => {
      const lines = plain(
        [
          {
            _tag: "table",
            columns: [{ header: "Name", priority: "required" }, { header: "Detail" }],
            rows: [["deploy", "a detail sentence that is far too wide for the terminal"]],
          },
        ],
        44,
      );
      expect(lines).toEqual([
        "Name     Detail",
        "deploy   a detail sentence that is far too",
        "         wide for the terminal",
      ]);
    });

    it("drops optional columns from the right and says so", () => {
      const lines = plain(
        [
          {
            _tag: "table",
            columns: [
              { header: "Name", priority: "required" },
              { header: "State" },
              { header: "Extra one", priority: "optional" },
              { header: "Extra two", priority: "optional" },
            ],
            rows: [["deployment-tools", "installed", "twenty-characters-x", "twenty-characters-y"]],
          },
        ],
        48,
      );
      expect(lines).toEqual([
        "Name               State",
        "deployment-tools   installed",
        "Not shown at this width: Extra one, Extra two",
      ]);
    });

    it("stacks an overflowing table below the stacked threshold", () => {
      const lines = plain(
        [
          {
            _tag: "table",
            columns: [{ header: "Name" }, { header: "State" }, { header: "Agents" }],
            rows: [
              ["deploy", "installed", "claude-code, codex, cursor"],
              ["audit", "detected", "none"],
            ],
          },
        ],
        36,
      );
      expect(lines).toEqual([
        "Name    deploy",
        "State   installed",
        "Agents  claude-code, codex, cursor",
        "",
        "Name    audit",
        "State   detected",
        "Agents  none",
      ]);
      expect(widest(lines)).toBeLessThanOrEqual(36);
    });

    it("paints natural widths without wrapping, truncation, or padding when unbounded", () => {
      const lines = plain(skillsList, "unbounded");
      expect(lines).toHaveLength(5);
      expect(lines[2]).toContain(
        "claude-code:projected, codex:projected, cursor:projected, gemini-cli:projected",
      );
      expect(lines.every((line) => !line.endsWith(" "))).toBe(true);
    });

    it("right-aligns numeric columns", () => {
      expect(
        plain(
          [
            {
              _tag: "table",
              columns: [{ header: "Bundle" }, { header: "Concepts", align: "right" }],
              rows: [
                ["agentxm", "12"],
                ["effect-v4", "7"],
              ],
            },
          ],
          80,
        ),
      ).toEqual(["Bundle      Concepts", "agentxm           12", "effect-v4          7"]);
    });
  });

  it("paints the ASCII document layout", () => {
    const lines = paintText(everyNodeDocument, { width: 80, colors: false, glyphs: asciiGlyphs });
    expect(lines.slice(0, 7)).toEqual([
      "+ Ready",
      "部署 package is ready for review",
      "+ alpha   created",
      "~ beta   updated",
      "= 2 unchanged",
      "! Warning",
      "  Check permissions",
    ]);
    expect(lines).toContain("`- root  managed");
    expect(lines).toContain("   `- child");
    expect(lines).toContain("  Inspect - axm list");
  });
});

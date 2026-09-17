import { describe, expect, it } from "vitest";

import type { Doc, LedgerColumn, TableColumn } from "./doc.js";
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
    caption:
      "3 skills (2 configured, 0 implicit, 2 installed, 0 leftover, 0 undeclared, 1 unmanaged)",
  },
];

const plain = (doc: Doc, width: PaintStyle["width"]) => paintText(doc, { width, colors: false });

const widest = (lines: ReadonlyArray<string>) => Math.max(0, ...lines.map(displayWidth));

describe("paintText", () => {
  it("paints the document grammar without color", () => {
    expect(plain(document, 80)).toEqual([
      " ✔   Installed 2 skills",
      "",
      " +   deploy     1.4.0   created",
      " =   rollback   0.9.2   already installed",
      " =   4 skills unchanged  --verbose to list",
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
    expect(lines).toEqual([
      " ~   skill",
      "     a very long",
      "     destination that",
      "     cannot fit",
    ]);
    expect(widest(lines)).toBeLessThanOrEqual(24);
  });

  it("paints every node kind as one stable wide document", () => {
    expect(plain(everyNodeDocument, 80)).toEqual([
      " ✔   Ready",
      "部署 package is ready for review",
      " +   alpha   created",
      " ~   beta   updated",
      " =   2 unchanged",
      " ▲   Warning",
      "     Check permissions",
      "Inventory",
      "  Name    State",
      "  alpha   ready",
      "     Owner                         @acme",
      "└─ root  managed",
      "   └─ child",
      "Next",
      "  Inspect · axm list",
      "1 changed in 1.2s",
      "Details",
      "     Section body",
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
        "3 skills (2 configured, 0 implicit, 2 installed, 0 leftover, 0 undeclared, 1 unmanaged)",
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

  describe("gutter and value column", () => {
    const marked: Doc = [
      { _tag: "headline", tone: "error", text: "Install failed" },
      {
        _tag: "rows",
        rows: [
          { _tag: "row", change: "create", cells: ["alpha", "created"] },
          { _tag: "row", change: "rolled-back", cells: ["beta", "rolled back"] },
        ],
      },
      { _tag: "collapsed", change: "unchanged", count: 2, noun: "unchanged" },
      { _tag: "callout", tone: "info", title: "Note" },
    ];

    it.each([
      { name: "Unicode", glyphs: undefined },
      { name: "ASCII", glyphs: asciiGlyphs },
    ])("starts content after every $name mark at column six", ({ glyphs }) => {
      const lines = paintText(marked, {
        width: 80,
        colors: false,
        ...(glyphs === undefined ? {} : { glyphs }),
      });
      expect(lines).toHaveLength(5);
      for (const line of lines) {
        expect(line.slice(0, 5), line).toMatch(/^ \S {3}$/u);
        expect(line.charAt(5), line).not.toBe(" ");
      }
    });

    it("gives a verdict after change rows no glyph and bolds it", () => {
      const verdict: Doc = [
        { _tag: "row", change: "remove", cells: ["alpha", "removed"] },
        { _tag: "blank" },
        { _tag: "headline", tone: "ok", text: "Uninstalled 1 skill", aside: "0.5s" },
      ];
      expect(plain(verdict, 80)).toEqual([" –   alpha   removed", "", "Uninstalled 1 skill  0.5s"]);
      expect(paintText(verdict, { width: 80, colors: true }).join("\n")).toContain(
        "\u001b[1m\u001b[32mUninstalled",
      );
    });

    it("keeps the glyph on a problem with no change rows above it", () => {
      expect(plain([{ _tag: "headline", tone: "error", text: "Sign-in expired" }], 80)).toEqual([
        " ✖   Sign-in expired",
      ]);
    });

    const problem: Doc = [
      {
        _tag: "callout",
        tone: "error",
        title: "Invalid skill name",
        aside: "validation · exit 9",
        children: [
          {
            _tag: "fields",
            fields: [
              { label: "name", value: '"Code Review!"' },
              { label: "allowed", value: "lowercase letters, digits and hyphens" },
            ],
          },
        ],
      },
      { _tag: "fields", fields: [{ label: "try", value: "code-review" }] },
    ];

    it("puts field values and callout asides on one value column", () => {
      expect(plain(problem, 80)).toEqual([
        " ✖   Invalid skill name            validation · exit 9",
        '     name                          "Code Review!"',
        "     allowed                       lowercase letters, digits and hyphens",
        "     try                           code-review",
      ]);
    });

    it("moves the value column left to keep half a narrow terminal for values", () => {
      const lines = plain(problem, 60);
      expect(lines).toEqual([
        " ✖   Invalid skill name       validation · exit 9",
        '     name                     "Code Review!"',
        "     allowed                  lowercase letters, digits and",
        "                              hyphens",
        "     try                      code-review",
      ]);
      expect(widest(lines)).toBeLessThanOrEqual(60);
    });

    it("keeps an aside on the title line when the title passes the value column", () => {
      expect(
        plain(
          [
            {
              _tag: "headline",
              tone: "warn",
              text: "Publish is blocked — an explicit override is required",
              aside: "exit 2",
            },
          ],
          80,
        ),
      ).toEqual([" ▲   Publish is blocked — an explicit override is required   exit 2"]);
    });

    it("moves a value below a label too long for the key lane", () => {
      expect(
        plain(
          [
            {
              _tag: "fields",
              fields: [{ label: "A label longer than the key lane allows", value: "value" }],
            },
          ],
          80,
        ),
      ).toEqual(["     A label longer than the key lane allows", "       value"]);
    });

    it("pushes a long label's value right instead of moving it when unbounded", () => {
      const lines = plain(
        [
          {
            _tag: "fields",
            fields: [
              { label: "Owner", value: "@acme" },
              { label: "A label longer than the key lane allows", value: "value" },
            ],
          },
        ],
        "unbounded",
      );
      expect(lines).toEqual([
        "     Owner                         @acme",
        "     A label longer than the key lane allows   value",
      ]);
      expect(lines.every((line) => !line.endsWith(" "))).toBe(true);
    });

    it("keeps marks in the gutter and content at the content column inside a titled section", () => {
      expect(
        plain(
          [
            {
              _tag: "section",
              title: "1 warning",
              children: [
                { _tag: "callout", tone: "warn", title: "Pre-release Effect version" },
                { _tag: "paragraph", text: "@craigsmitham/effect-v4" },
              ],
            },
          ],
          80,
        ),
      ).toEqual(["1 warning", " ▲   Pre-release Effect version", "     @craigsmitham/effect-v4"]);
    });
  });

  describe("ledgers", () => {
    const columns: ReadonlyArray<LedgerColumn> = [
      { header: "Extension", role: "name" },
      { header: "Version", role: "fixed", priority: "preferred" },
      { header: "Plan", role: "fixed", priority: "required" },
      { header: "Detail", role: "elastic", priority: "optional" },
    ];
    const ledger: Doc = [
      {
        _tag: "ledger",
        columns,
        rows: [
          {
            id: "@acme/skills/code-review",
            mark: "create",
            cells: ["@acme/skills/code-review", "1.4.0", "install", "42 files"],
          },
          {
            id: "@acme/skills/triage",
            mark: "update",
            cells: ["@acme/skills/triage", "2.0.1", "update", "from 1.9.4"],
          },
        ],
        folded: { mark: "unchanged", count: 3, noun: "unchanged", hint: "--verbose to list" },
      },
    ];

    it("puts the headers behind a blank gutter and every column after the name at the value column", () => {
      expect(plain(ledger, 100)).toEqual([
        "     Extension                     Version   Plan      Detail",
        " +   @acme/skills/code-review      1.4.0     install   42 files",
        " ~   @acme/skills/triage           2.0.1     update    from 1.9.4",
        " =   3 unchanged  --verbose to list",
      ]);
      // The name column keeps the key lane, so the second column starts at 36.
      expect(plain(ledger, 100)[0]?.indexOf("Version")).toBe(35);
      expect(plain(ledger, 100)[1]?.indexOf("1.4.0")).toBe(35);
    });

    it("drops an optional column before anything else", () => {
      expect(plain(ledger, 60)).toEqual([
        "     Extension                     Version   Plan",
        " +   @acme/skills/code-review      1.4.0     install",
        " ~   @acme/skills/triage           2.0.1     update",
        " =   3 unchanged  --verbose to list",
      ]);
    });

    it("stacks rather than drop a column that is not optional", () => {
      expect(plain(ledger, 44)).toEqual([
        " +   @acme/skills/code-review",
        "     1.4.0 · install",
        " ~   @acme/skills/triage",
        "     2.0.1 · update",
        " =   3 unchanged  --verbose to list",
      ]);
    });

    it("indents a nested row's name inside the name column", () => {
      const nested: Doc = [
        {
          _tag: "ledger",
          columns: [
            { header: "", role: "name" },
            { header: "", role: "fixed", priority: "required" },
          ],
          rows: [
            { mark: "ok", cells: ["@acme/packs/review-kit", "installed"] },
            { mark: "ok", depth: 1, cells: ["@acme/skills/code-review", "installed"] },
          ],
        },
      ];
      expect(plain(nested, 80)).toEqual([
        " ✔   @acme/packs/review-kit        installed",
        " ✔     @acme/skills/code-review    installed",
      ]);
    });

    it("paints a status mark and a change mark from the same gutter", () => {
      const marks: Doc = [
        {
          _tag: "ledger",
          columns: [{ header: "", role: "name" }],
          rows: [
            { mark: "ok", cells: ["published"] },
            { mark: "error", cells: ["refused"] },
            { mark: "failed", cells: ["timed out"] },
          ],
        },
      ];
      expect(plain(marks, 80)).toEqual([" ✔   published", " ✖   refused", " ×   timed out"]);
    });

    it("keeps the lane and natural widths, and never stacks, when unbounded", () => {
      expect(plain(ledger, "unbounded")).toEqual([
        "     Extension                     Version   Plan      Detail",
        " +   @acme/skills/code-review      1.4.0     install   42 files",
        " ~   @acme/skills/triage           2.0.1     update    from 1.9.4",
        " =   3 unchanged  --verbose to list",
      ]);
    });

    it("paints an answer's value at the value column, or below a label too long for it", () => {
      const answers: Doc = [
        { _tag: "answer", mark: "ok", label: "Instructions source", value: "AGENTS.md" },
        { _tag: "answer", mark: "dim", label: "Agents", value: "claude-code, codex" },
      ];
      expect(plain(answers, 80)).toEqual([
        " ✔   Instructions source           AGENTS.md",
        "     Agents                        claude-code, codex",
      ]);
      expect(
        plain(
          [
            {
              _tag: "answer",
              mark: "ok",
              label: "A question longer than the key lane allows",
              value: "yes",
            },
          ],
          80,
        ),
      ).toEqual([" ✔   A question longer than the key lane allows", "       yes"]);
    });
  });

  it("paints the ASCII document layout", () => {
    const lines = paintText(everyNodeDocument, { width: 80, colors: false, glyphs: asciiGlyphs });
    expect(lines.slice(0, 7)).toEqual([
      " +   Ready",
      "部署 package is ready for review",
      " +   alpha   created",
      " ~   beta   updated",
      " =   2 unchanged",
      " !   Warning",
      "     Check permissions",
    ]);
    expect(lines).toContain("`- root  managed");
    expect(lines).toContain("   `- child");
    expect(lines).toContain("  Inspect - axm list");
  });
});

import { describe, expect, it } from "vitest";

import type { Doc } from "./doc.js";
import { stripTerminalFormatting } from "./output-policy.js";
import { paintText } from "./paint-text.js";

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

describe("paintText", () => {
  it("paints the document grammar without color", () => {
    expect(paintText(document, { width: 80, colors: false })).toEqual([
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

  it("truncates the final cell at narrow widths", () => {
    const [line] = paintText(
      [
        {
          _tag: "row",
          change: "update",
          cells: ["skill", "a very long destination that cannot fit"],
        },
      ],
      { width: 24, colors: false },
    );
    expect(line).toBe("~ skill   a very long d…");
  });

  it("paints every node kind as one stable wide document", () => {
    expect(paintText(everyNodeDocument, { width: 80, colors: false })).toEqual([
      "✔ Ready",
      "部署 package is ready for review",
      "+ alpha   created",
      "~ beta   updated",
      "= 2 unchanged",
      "▲ Warning",
      "  Check permissions",
      "Inventory",
      "  Name   State",
      "= alpha   ready",
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
      const plain = paintText(everyNodeDocument, { width, colors: false }).join("\n");
      const colored = paintText(everyNodeDocument, { width, colors: true }).join("\n");

      expect(stripTerminalFormatting(colored)).toBe(plain);
      expect(colored).toContain("\u001b[");
      expect(plain).toContain("部署 package");
      expect(plain).toContain("pre-sanitized");
    },
  );

  it("wraps wide-character paragraphs at narrow widths", () => {
    expect(
      paintText([{ _tag: "paragraph", text: "部署 package has a continuation that must wrap" }], {
        width: 24,
        colors: false,
      }),
    ).toEqual(["部署 package has a", "continuation that must", "wrap"]);
  });
});

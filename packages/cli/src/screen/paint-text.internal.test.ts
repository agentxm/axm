import { describe, expect, it } from "vitest";

import type { Doc } from "./doc.js";
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
});

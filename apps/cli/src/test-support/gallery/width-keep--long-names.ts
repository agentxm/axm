import type { Doc } from "../../screen/doc.js";

/**
 * Long names keep their scope and last segment (*Width and height*, board
 * `Width — never cut, never pad`, frame *Long names keep their scope and last
 * segment*, drawn at 60 columns).
 *
 * The first name is wider than the name column allows at this width, so its
 * middle gives way: the scope a reader recognizes and the segment that tells
 * one extension from another both survive. A name that fits is untouched.
 */
export const widthKeepLongNames: Doc = [
  {
    _tag: "ledger",
    columns: [
      { header: "Extension", role: "name" },
      { header: "Version", role: "fixed", priority: "preferred" },
      { header: "Plan", role: "fixed", priority: "required" },
    ],
    rows: [
      {
        id: "@acme-enterprise/skills/audits/soc2-review",
        mark: "create",
        cells: ["@acme-enterprise/skills/audits/soc2-review", "1.4.0", "install"],
      },
      {
        id: "@acme/skills/code-review",
        mark: "create",
        cells: ["@acme/skills/code-review", "1.4.0", "install"],
      },
    ],
  },
];

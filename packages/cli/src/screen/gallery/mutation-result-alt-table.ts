import type { Doc } from "../doc.js";
import { mutationRows } from "./mutation-result.js";

/**
 * Alternative: the same settled result as a headed table without change
 * glyphs. Kept for side-by-side review; the accepted rendering is
 * `mutation-result` (change rows with children).
 */
export const mutationResultAltTable: Doc = [
  { _tag: "headline", tone: "ok", text: "Installed 3 skills", aside: "2.4s" },
  {
    _tag: "table",
    columns: [
      { header: "Extension", priority: "required" },
      { header: "Version" },
      { header: "Change", priority: "required" },
      { header: "Files", priority: "optional", align: "right" },
      { header: "Path", priority: "optional" },
    ],
    rows: mutationRows.map((row) => {
      const [name = "", version = "", change = "", ...rest] = row.cells;
      const files = rest.length === 2 ? (rest[0] ?? "") : "";
      const path = rest[rest.length - 1] ?? "";
      return [name, version, change, files, path];
    }),
  },
  {
    _tag: "collapsed",
    change: "unchanged",
    count: 5,
    noun: "skills already current",
    hint: "--verbose to list",
  },
  {
    _tag: "next",
    actions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
  },
];

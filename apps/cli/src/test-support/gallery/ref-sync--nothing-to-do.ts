import type { Doc } from "../../screen/doc.js";

/**
 * Two outcomes that changed nothing (*Reference cases*, board `2 · Sync,
 * update, uninstall`, frame *Nothing to do — the verdict alone, no empty
 * ledger*).
 *
 * There are no rows to carry marks, so there is no ledger and no header for a
 * reader to scan past: the verdict stands alone with the counts that make it
 * credible in its aside. The two lines are what `axm update` and `axm sync`
 * print when there is nothing to do.
 *
 * The canvas draws these lines without a mark. They keep the ✔ of a satisfied
 * outcome here, because the grammar gives a line with no marked rows above it
 * its own glyph, and because a reader should recognize a no-op as a success at
 * the same glance as every other one.
 */
export const refSyncNothingToDo: Doc = [
  {
    _tag: "headline",
    tone: "ok",
    text: [{ text: "Already up to date", bold: true }],
    aside: [{ text: "12 skills already current" }],
  },
  { _tag: "blank" },
  {
    _tag: "headline",
    tone: "ok",
    text: [{ text: "Nothing to sync", bold: true }],
    aside: [{ text: "16 extensions match axm.json and the lockfile" }],
  },
];

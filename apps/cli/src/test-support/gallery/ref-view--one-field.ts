import type { Doc } from "../../screen/doc.js";

/**
 * One requested field (*Reference cases*, board `5 · View`, frame *One field
 * — raw on stdout, nothing else, so it composes*).
 *
 * The value alone, with no label, gutter or page around it, so
 * `axm view <extension> latest` pipes into another command.
 */
export const refViewOneField: Doc = [{ _tag: "raw", content: "1.4.0" }];

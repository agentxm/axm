import { lintFrame } from "./lint-findings.js";

/**
 * No findings (*Reference cases*, board `3 · Lint`, frame *Clean, drifted and
 * quiet*, first transcript).
 *
 * There are no rows, so there is no title and no ledger: the verdict stands
 * alone with its own mark. The canvas's aside counts extensions, rules, and
 * elapsed time; lint reports none of those, so it states where it ran.
 */
export const refLintClean = lintFrame([]);

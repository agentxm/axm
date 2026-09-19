import {
  floatingMember,
  lintFrame,
  missingDescription,
  staleLockfile,
} from "./samples/lint-findings.js";

/**
 * A few findings (*Reference cases*, board `3 · Lint`, frame *lint — what is
 * wrong and where on the row; the rule and its help beneath. Errors first*).
 *
 * Each row says what is wrong and where, and whether `--fix` repairs it; the
 * rule and the first thing it says sit dim beneath. The verdict counts by
 * severity, names how many are fixable and the exit code, and the one fixable
 * finding earns a `next` command.
 *
 * The canvas's title aside also counts extensions and rules. Lint does not
 * report either today, so the aside states only where it ran.
 */
export const refLintDefault = lintFrame([staleLockfile, missingDescription, floatingMember]);

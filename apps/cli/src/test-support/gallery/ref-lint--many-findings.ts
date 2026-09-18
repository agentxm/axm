import {
  floatingMember,
  lintFrame,
  missingDescription,
  repeated,
  staleLockfile,
} from "./lint-findings.js";

/**
 * Many findings (*Reference cases*, board `3 · Lint`, frame *Many findings — a
 * rule that repeats folds into one row; --verbose unfolds it*).
 *
 * A rule reported at three or more locations folds into one row with a
 * location count, naming the first two beneath it. A rule reported once keeps
 * its own row. The verdict says how many locations the folded rows stand for,
 * and a dim line names the flag that lists them.
 */
export const refLintManyFindings = lintFrame([
  ...repeated(missingDescription, ["skills/triage/SKILL.md", "skills/standup/SKILL.md"], 12),
  staleLockfile,
  ...repeated(
    {
      ...floatingMember,
      severity: "warning",
      ruleId: "skill/name-matches-directory",
      title: "Name differs from its directory.",
      ruleDescription: "Name differs from its directory.",
    },
    ["skills/code_review", "skills/lintFix"],
    7,
  ),
  ...repeated(floatingMember, ["packs/review-kit", "packs/ops", "packs/docs"], 3),
]);

import { describe, expect, it } from "vitest";

import { asciiGlyphs, paintText } from "../../screen/index.js";
import {
  floatingMember,
  lintFrame,
  missingDescription,
  repeated,
  staleLockfile,
} from "../../test-support/gallery/samples/lint-findings.js";
import { FOLD_THRESHOLD } from "./view.js";

const paint = (doc: ReturnType<typeof lintFrame>): string =>
  paintText(doc, { width: "unbounded", colors: false, glyphs: asciiGlyphs }).join("\n");

const paths = (count: number): ReadonlyArray<string> =>
  Array.from({ length: count }, (_, index) => `skills/s${String(index)}/SKILL.md`);

describe("lint findings ledger", () => {
  it("keeps a rule below the fold threshold as one row per location", () => {
    const text = paint(
      lintFrame(repeated(missingDescription, paths(FOLD_THRESHOLD - 1), FOLD_THRESHOLD - 1)),
    );
    expect(text).toContain("skills/s0/SKILL.md");
    expect(text).toContain("skills/s1/SKILL.md");
    expect(text).not.toContain("locations");
  });

  it("folds a rule at the threshold into one row with a location count", () => {
    const text = paint(
      lintFrame(repeated(missingDescription, paths(FOLD_THRESHOLD + 2), FOLD_THRESHOLD + 2)),
    );
    expect(text.match(/Description is missing/g)).toHaveLength(1);
    expect(text).toContain(`${String(FOLD_THRESHOLD + 2)} locations`);
    expect(text).toContain("skills/s0/SKILL.md, skills/s1/SKILL.md, and 3 more");
    expect(text).toContain("--verbose lists every location");
  });

  it("names the rule's invariant when a folded rule's findings say different things", () => {
    const findings = repeated(missingDescription, paths(FOLD_THRESHOLD), FOLD_THRESHOLD).map(
      (finding, index) => ({
        ...finding,
        title: `Skill s${String(index)} has no description.`,
        ruleDescription: "Every skill has a description.",
      }),
    );
    expect(paint(lintFrame(findings))).toContain("Every skill has a description");
  });

  it("unfolds every location, with every detail, at verbose level", () => {
    const text = paint(
      lintFrame(
        repeated(
          { ...missingDescription, helps: ["First help.", "Second help."] },
          paths(FOLD_THRESHOLD),
          FOLD_THRESHOLD,
        ),
        { verbosity: "verbose" },
      ),
    );
    expect(text.match(/Description is missing/g)).toHaveLength(FOLD_THRESHOLD);
    expect(text).toContain("Second help");
    expect(text).not.toContain("--verbose lists every location");
  });

  it("points at --fix only while a remaining finding is fixable", () => {
    expect(paint(lintFrame([staleLockfile, floatingMember]))).toMatch(
      /axm lint --fix\W+Apply the available automatic fix/,
    );
    expect(paint(lintFrame([floatingMember]))).not.toContain("axm lint --fix");
  });

  it("states the exit code only when the run fails", () => {
    expect(paint(lintFrame([staleLockfile]))).toContain("exit 1");
    expect(paint(lintFrame([floatingMember]))).not.toContain("exit");
  });

  it("states what automatic fixes completed and what remains", () => {
    expect(
      paint(
        lintFrame([missingDescription, floatingMember], {
          fix: true,
          repaired: [staleLockfile],
        }),
      ),
    ).toContain("Fixed 1 finding; 1 error and 1 warning remain");
  });
});

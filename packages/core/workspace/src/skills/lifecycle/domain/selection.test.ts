import { describe, expect, it } from "vitest";
import { decideSkillSelection } from "./selection.js";

const names = ["inspect-patch", "draft-release", "inspect-tests"] as const;
const request = { requestedSkills: [], all: false, nonInteractive: false };

describe("skill selection policy", () => {
  it("needs a choice whenever candidates remain unselected", () => {
    expect(decideSkillSelection(names, request)).toEqual({ kind: "choice-required" });
    expect(decideSkillSelection(["inspect-patch"], request)).toEqual({
      kind: "choice-required",
    });
  });
  it("preserves candidate order and deduplicates overlapping requested patterns", () => {
    expect(
      decideSkillSelection(names, {
        ...request,
        requestedSkills: ["inspect-tests", "inspect-*", "inspect-patch"],
      }),
    ).toEqual({ kind: "selected", names: ["inspect-patch", "inspect-tests"] });
  });
  it("keeps named selection ahead of all and unattended selection", () => {
    expect(
      decideSkillSelection(names, {
        requestedSkills: ["draft-release"],
        all: true,
        nonInteractive: true,
      }),
    ).toEqual({ kind: "selected", names: ["draft-release"] });
  });
  it("reports a wholly unmatched request without asking for another choice", () => {
    expect(
      decideSkillSelection(names, {
        ...request,
        requestedSkills: ["missing"],
      }),
    ).toEqual({ kind: "unmatched" });
  });
  it("retains the current union of matches when some patterns are unmatched", () => {
    expect(
      decideSkillSelection(names, {
        ...request,
        requestedSkills: ["missing", "draft-release"],
      }),
    ).toEqual({ kind: "selected", names: ["draft-release"] });
  });
  it("selects every candidate only when --all supplies that decision", () => {
    expect(decideSkillSelection(names, { ...request, all: true })).toEqual({
      kind: "selected",
      names,
    });
  });
  it("requires an explicit decision in non-interactive mode", () => {
    expect(decideSkillSelection(names, { ...request, nonInteractive: true })).toEqual({
      kind: "explicit-selection-required",
    });
  });
});

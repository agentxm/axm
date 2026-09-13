import { describe, expect, it } from "vitest";
import { decideSkillSelection } from "./selection.js";

const names = ["inspect-patch", "draft-release", "inspect-tests"] as const;
const request = { requestedSkills: [], all: false, nonInteractive: false };

describe("skill selection policy", () => {
  it("needs a choice only when multiple candidates remain unselected", () => {
    expect(decideSkillSelection(names, request)).toEqual({ kind: "choice-required" });
    expect(decideSkillSelection(["inspect-patch"], request)).toEqual({
      kind: "selected",
      names: ["inspect-patch"],
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
  it.each([
    { ...request, all: true },
    { ...request, nonInteractive: true },
  ])("selects every candidate when the invocation supplies this decision: %j", (input) => {
    expect(decideSkillSelection(names, input)).toEqual({ kind: "selected", names });
  });
});

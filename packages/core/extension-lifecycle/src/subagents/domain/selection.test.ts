import { describe, expect, it } from "vitest";
import { decideSubagentSelection } from "./selection.js";

const names = ["inspect-patch", "draft-release", "inspect-tests"] as const;
const request = { requestedSubagents: [], all: false, nonInteractive: false };

describe("subagent selection policy", () => {
  it("needs a choice only when multiple candidates remain unselected", () => {
    expect(decideSubagentSelection(names, request)).toEqual({ kind: "choice-required" });
    expect(decideSubagentSelection(["inspect-patch"], request)).toEqual({
      kind: "selected",
      names: ["inspect-patch"],
    });
  });
  it("preserves candidate order and deduplicates overlapping requested patterns", () => {
    expect(
      decideSubagentSelection(names, {
        ...request,
        requestedSubagents: ["inspect-tests", "inspect-*", "inspect-patch"],
      }),
    ).toEqual({ kind: "selected", names: ["inspect-patch", "inspect-tests"] });
  });
  it("keeps named selection ahead of all and unattended selection", () => {
    expect(
      decideSubagentSelection(names, {
        requestedSubagents: ["draft-release"],
        all: true,
        nonInteractive: true,
      }),
    ).toEqual({ kind: "selected", names: ["draft-release"] });
  });
  it("reports a wholly unmatched request without asking for another choice", () => {
    expect(
      decideSubagentSelection(names, {
        ...request,
        requestedSubagents: ["missing"],
      }),
    ).toEqual({ kind: "unmatched" });
  });
  it("retains the current union of matches when some patterns are unmatched", () => {
    expect(
      decideSubagentSelection(names, {
        ...request,
        requestedSubagents: ["missing", "draft-release"],
      }),
    ).toEqual({ kind: "selected", names: ["draft-release"] });
  });
  it.each([
    { ...request, all: true },
    { ...request, nonInteractive: true },
  ])("selects every candidate when the invocation supplies this decision: %j", (input) => {
    expect(decideSubagentSelection(names, input)).toEqual({ kind: "selected", names });
  });
});

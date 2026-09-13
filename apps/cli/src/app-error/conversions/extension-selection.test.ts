import { describe, expect, it } from "vitest";
import {
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "@agentxm/extension-lifecycle/skills/application";
import {
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "@agentxm/extension-lifecycle/subagents/application";
import { makeAppError } from "../app-error.js";
import { isKnownFailure, toAppError } from "../conversions.js";

describe("CLI selection failure rendering", () => {
  it("renders skill facts with the existing error category and recovery", () => {
    const failure = new SkillSelectionNotFound({
      requested: ["missing"],
      available: ["z-last", "a-first"],
    });
    expect(isKnownFailure(failure)).toBe(true);
    expect(toAppError(failure)).toMatchObject({
      code: "not_found",
      detail: "No skills matched: missing. Source contains: a-first, z-last",
      suggestions: [{ description: "Check the skill names or patterns and try again" }],
    });
  });
  it("preserves subagent rendering while its policy reports only facts", () => {
    const failure = new SubagentSelectionNotFound({
      requested: ["missing"],
      available: ["review"],
    });
    expect(isKnownFailure(failure)).toBe(true);
    expect(toAppError(failure)).toMatchObject({
      code: "internal",
      detail: "No subagents matched: missing",
      suggestions: [{ description: "Check the subagent names or patterns and try again." }],
    });
  });
  for (const Unavailable of [SkillSelectionUnavailable, SubagentSelectionUnavailable]) {
    it(`keeps terminal guidance through ${Unavailable.name}`, () => {
      const cause = makeAppError({
        code: "usage",
        detail: "Terminal unavailable",
        recover: "Pass an explicit name",
      });
      const failure = new Unavailable({ cause });
      expect(isKnownFailure(failure)).toBe(true);
      expect(toAppError(failure)).toBe(cause);
    });
    it(`renders ${Unavailable.name} from another interface without requiring CLI errors`, () => {
      const failure = new Unavailable({ cause: new Error("Connection closed") });
      expect(toAppError(failure)).toMatchObject({ code: "usage" });
      expect(toAppError(failure).suggestions).toHaveLength(1);
    });
  }
});

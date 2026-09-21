import { describe, expect, it } from "vitest";

import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";
type CandidateFailurePoint =
  "version" | "changelog" | "stamp" | "generate-skill" | "generate-cli-reference" | "validate";

describe("release candidate phase orchestration", () => {
  const candidateFailurePoints: readonly CandidateFailurePoint[] = [
    "version",
    "changelog",
    "stamp",
    "generate-skill",
    "generate-cli-reference",
    "validate",
  ];

  const makeCandidateHost = (failurePoint?: CandidateFailurePoint) => {
    const events: string[] = [];
    const failAt = (point: CandidateFailurePoint) => {
      if (failurePoint === point) throw new Error(`${point} failed`);
    };
    const host: ReleaseCandidateHost<"version-context"> = {
      version: async () => {
        events.push("version");
        failAt("version");
        return { version: "1.2.3", context: "version-context" };
      },
      changelog: async () => {
        events.push("changelog");
        failAt("changelog");
      },
      stampSkill: () => {
        events.push("stamp");
        failAt("stamp");
      },
      generateSkill: () => {
        events.push("generate-skill");
        failAt("generate-skill");
      },
      generateCliReference: () => {
        events.push("generate-cli-reference");
        failAt("generate-cli-reference");
      },
      validateCohort: () => {
        events.push("validate");
        failAt("validate");
      },
    };
    return { events, host };
  };

  it("generates the exact candidate before cohort validation", async () => {
    const { events, host } = makeCandidateHost();

    await expect(runReleaseCandidatePreparation(host)).resolves.toBe("1.2.3");
    expect(events).toEqual([
      "version",
      "changelog",
      "stamp",
      "generate-skill",
      "generate-cli-reference",
      "validate",
    ]);
  });

  it.each(candidateFailurePoints)("stops when candidate phase %s fails", async (failurePoint) => {
    const { events, host } = makeCandidateHost(failurePoint);

    await expect(runReleaseCandidatePreparation(host)).rejects.toThrow(`${failurePoint} failed`);
    expect(events.at(-1)).toBe(failurePoint);
  });
});

import { describe, expect, it } from "vitest";

import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";
import {
  AXM_SKILL_HANDLE,
  PRODUCTION_REGISTRY_PREVIEW_ARGS,
  PRODUCTION_REGISTRY_URL,
  productionRegistryPreviewArgs,
} from "./release-shared.js";

type CandidateFailurePoint =
  "version" | "changelog" | "stamp" | "generate" | "exact-preview" | "validate";

describe("release candidate Registry contract", () => {
  it("targets the authenticated production preview contract", () => {
    expect(PRODUCTION_REGISTRY_URL).toBe("https://registry.agentxm.ai");
    expect(PRODUCTION_REGISTRY_PREVIEW_ARGS).toEqual([
      "axm:local",
      "skills",
      "publish",
      AXM_SKILL_HANDLE,
      "--registry-url",
      PRODUCTION_REGISTRY_URL,
      "--on-existing",
      "verify",
      "--preview",
      "--json",
      "--non-interactive",
    ]);
  });

  it("can verify the published archive from its released workspace", () => {
    expect(productionRegistryPreviewArgs("/tmp/axm-released")).toEqual([
      "axm:local",
      "-C",
      "/tmp/axm-released",
      "skills",
      "publish",
      AXM_SKILL_HANDLE,
      "--registry-url",
      PRODUCTION_REGISTRY_URL,
      "--on-existing",
      "verify",
      "--preview",
      "--json",
      "--non-interactive",
    ]);
  });
});

describe("release candidate phase orchestration", () => {
  const candidateFailurePoints: readonly CandidateFailurePoint[] = [
    "version",
    "changelog",
    "stamp",
    "generate",
    "exact-preview",
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
        events.push("generate");
        failAt("generate");
      },
      previewRegistry: () => {
        events.push("exact-preview");
        failAt("exact-preview");
      },
      validateCohort: () => {
        events.push("validate");
        failAt("validate");
      },
    };
    return { events, host };
  };

  it("generates the exact candidate before Registry preview", async () => {
    const { events, host } = makeCandidateHost();

    await expect(runReleaseCandidatePreparation(host)).resolves.toBe("1.2.3");
    expect(events).toEqual([
      "version",
      "changelog",
      "stamp",
      "generate",
      "exact-preview",
      "validate",
    ]);
  });

  it.each(candidateFailurePoints)("stops when candidate phase %s fails", async (failurePoint) => {
    const { events, host } = makeCandidateHost(failurePoint);

    await expect(runReleaseCandidatePreparation(host)).rejects.toThrow(`${failurePoint} failed`);
    expect(events.at(-1)).toBe(failurePoint);
  });
});

import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as semver from "semver";

import { derivePreviewVersion } from "./release-preview-version.js";

export const specification = defineSpecification({
  requirement: "system/process/release-preview-preserves-canonical-candidate",
  title: "Release previews preserve the canonical candidate",
  statement:
    "The explicitly dispatched bootstrap-prerelease mode of the canonical release workflow shall derive a deterministic preview version below the current stable cohort version so bootstrap publication cannot supersede that stable version.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  methods: ["example"],
  derivedFrom: ["system/process/release-publication-preserves-newer-versions"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Release previews preserve the canonical candidate", () => {
  it("derives a workflow-identity preview below its stable base", () => {
    const base = "0.28.13";
    const preview = derivePreviewVersion({
      base,
      sequence: 34_707_752_347,
      shortSha: "5cd4595aa123",
    });

    expect(preview).toBe("0.28.13-preview.34707752347.5cd4595aa123");
    expect(semver.lt(preview, base)).toBe(true);
  });
});

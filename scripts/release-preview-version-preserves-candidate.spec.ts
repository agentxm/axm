import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as semver from "semver";

import { derivePreviewVersion } from "./release-preview-version.js";

export const specification = defineSpecification({
  requirement: "system/process/release-preview-preserves-canonical-candidate",
  title: "Release previews preserve the canonical candidate",
  statement:
    "The local npm cohort preview workflow shall derive every preview version below the current stable cohort version so a first preview publication cannot cause canonical publication of that stable version to be treated as superseded.",
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
  it("derives clean and dirty previews below their stable base", () => {
    const base = "0.28.13";
    const clean = derivePreviewVersion({
      base,
      dirty: false,
      seconds: 1_789_139_351,
      shortSha: "5cd4595aa",
    });
    const dirty = derivePreviewVersion({
      base,
      dirty: true,
      seconds: 1_789_139_351,
      shortSha: "5cd4595aa",
    });

    expect(clean).toBe("0.28.13-preview.1789139351.5cd4595aa");
    expect(dirty).toBe("0.28.13-preview.1789139351.5cd4595aa.dirty");
    expect(semver.lt(clean, base)).toBe(true);
    expect(semver.lt(dirty, base)).toBe(true);
  });
});

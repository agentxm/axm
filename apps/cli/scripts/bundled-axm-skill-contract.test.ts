import { describe, expect, it } from "vitest";

import { validateBundledAxmSkillContract } from "./bundled-axm-skill-contract.js";

const skillMd = (metadata: string) => `---
name: axm
description: AXM test skill.
metadata:
${metadata}
---

# AXM
`;

describe("validateBundledAxmSkillContract", () => {
  it("returns the exact release contract used by generated constants", () => {
    expect(
      validateBundledAxmSkillContract(
        "1.2.3",
        skillMd('  axm.sh/cli-version: "1.2.3"\n  axm.sh/cli-version-range: "1.2.3"'),
      ),
    ).toEqual({ version: "1.2.3", cliVersion: "1.2.3", cliVersionRange: "1.2.3" });
  });

  it("preserves an intentional bounded range containing the release", () => {
    expect(
      validateBundledAxmSkillContract(
        "1.2.3",
        skillMd('  axm.sh/cli-version: "1.2.3"\n  axm.sh/cli-version-range: ">=1.2.0 <1.3.0"'),
      ).cliVersionRange,
    ).toBe(">=1.2.0 <1.3.0");
  });

  it.each([
    {
      name: "a manifest and release-stamp mismatch",
      metadata: '  axm.sh/cli-version: "1.2.2"\n  axm.sh/cli-version-range: "1.2.2"',
      reason: "skill-release-mismatch",
    },
    {
      name: "a range excluding its release",
      metadata: '  axm.sh/cli-version: "1.2.3"\n  axm.sh/cli-version-range: ">=1.1.0 <1.2.0"',
      reason: "skill-release-range-mismatch",
    },
    {
      name: "an unbounded range",
      metadata: '  axm.sh/cli-version: "1.2.3"\n  axm.sh/cli-version-range: ">=1.2.0"',
      reason: "compatibility-metadata-malformed",
    },
  ])("rejects $name", ({ metadata, reason }) => {
    expect(() => validateBundledAxmSkillContract("1.2.3", skillMd(metadata))).toThrow(reason);
  });

  it("rejects invalid standard skill frontmatter before compatibility evaluation", () => {
    expect(() =>
      validateBundledAxmSkillContract(
        "1.2.3",
        `---\nname: other\ndescription: Wrong directory.\n---\n`,
      ),
    ).toThrow("invalid bundled AXM SKILL.md");
  });
});

import { describe, expect, it } from "@effect/vitest";

import {
  readGeneratedSkillCompatibilityFromContent,
  readSkillCompatibilityFromContent,
  stampSkillCompatibilityContent,
  transitionSkillCompatibility,
  validateGeneratedSkillCompatibility,
  stampSkillManifestContent,
} from "./release-skill-compatibility.js";

describe("bundled skill release stamps", () => {
  it("renders the manifest and transitions the managed compatibility range", () => {
    const manifest = stampSkillManifestContent(
      '{\n  "name": "axm",\n  "version": "0.2.8",\n  "description": "Test skill"\n}\n',
      "0.24.9",
    );
    const document = stampSkillCompatibilityContent(
      '---\nname: axm\ndescription: AXM test skill.\nmetadata:\n  axm.sh/cli-version: "0.2.8"\n  axm.sh/cli-version-range: ">=0.2.0 <0.3.0"\n---\n\n# AXM\n',
      "0.24.9",
    );
    expect(JSON.parse(manifest)).toMatchObject({ version: "0.24.9", description: "Test skill" });
    expect(readSkillCompatibilityFromContent(document, "SKILL.md")).toEqual({
      cliVersion: "0.24.9",
      cliVersionRange: ">=0.24.0 <0.25.0",
    });
  });

  it("retains the managed minor band for a patch release", () => {
    // A patch release no longer strands workspaces still holding the previous
    // patch's skill.
    expect(
      transitionSkillCompatibility(
        { cliVersion: "0.27.11", cliVersionRange: ">=0.27.0 <0.28.0" },
        "0.27.12",
      ),
    ).toEqual({ cliVersion: "0.27.12", cliVersionRange: ">=0.27.0 <0.28.0" });
  });

  it("rolls a managed minor band forward for a breaking release", () => {
    expect(
      transitionSkillCompatibility(
        { cliVersion: "0.27.18", cliVersionRange: ">=0.27.0 <0.28.0" },
        "0.28.0",
      ),
    ).toEqual({ cliVersion: "0.28.0", cliVersionRange: ">=0.28.0 <0.29.0" });
  });

  it("preserves an intentional range only when it includes the next release", () => {
    expect(
      transitionSkillCompatibility(
        { cliVersion: "1.2.3", cliVersionRange: ">=1.2.0 <1.3.0" },
        "1.2.4",
      ),
    ).toEqual({ cliVersion: "1.2.4", cliVersionRange: ">=1.2.0 <1.3.0" });

    expect(() =>
      transitionSkillCompatibility({ cliVersion: "1.2.3", cliVersionRange: "1.2.3" }, "1.2.4"),
    ).toThrow("skill-release-range-mismatch");

    expect(() =>
      transitionSkillCompatibility(
        { cliVersion: "1.2.3", cliVersionRange: ">=1.2.2 <1.3.0" },
        "1.3.0",
      ),
    ).toThrow("skill-release-range-mismatch");
  });

  it("rejects malformed or mismatched current declarations", () => {
    expect(() =>
      transitionSkillCompatibility({ cliVersion: "1.2.3", cliVersionRange: ">=1.2.0" }, "1.2.4"),
    ).toThrow("compatibility-metadata-malformed");

    expect(() =>
      transitionSkillCompatibility({ cliVersion: "1.2.3", cliVersionRange: "1.2.2" }, "1.2.4"),
    ).toThrow("skill-release-range-mismatch");
  });

  it("reads generated compatibility constants and rejects incomplete output", () => {
    expect(
      readGeneratedSkillCompatibilityFromContent(
        'export const AXM_SKILL_VERSION = "1.2.3";\nexport const AXM_SKILL_CLI_VERSION = "1.2.3";\nexport const AXM_SKILL_CLI_VERSION_RANGE = ">=1.2.0 <1.3.0";\n',
        "generated.ts",
      ),
    ).toEqual({
      version: "1.2.3",
      cliVersion: "1.2.3",
      cliVersionRange: ">=1.2.0 <1.3.0",
    });

    expect(() =>
      readGeneratedSkillCompatibilityFromContent(
        'export const AXM_SKILL_VERSION = "1.2.3";\n',
        "generated.ts",
      ),
    ).toThrow("AXM_SKILL_CLI_VERSION");
  });

  it("rejects generated constants that drift from the canonical declaration", () => {
    expect(() =>
      validateGeneratedSkillCompatibility(
        "1.2.3",
        { cliVersion: "1.2.3", cliVersionRange: "1.2.3" },
        { version: "1.2.3", cliVersion: "1.2.2", cliVersionRange: "1.2.3" },
        "generated.ts",
      ),
    ).toThrow("Generated AXM skill mismatch");
  });
});

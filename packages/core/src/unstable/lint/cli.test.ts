import { describe, expect, it } from "@effect/vitest";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
} from "../skills/axm-skill-compatibility.js";
import { resolveLintExitCategory, toLintJsonDocument } from "./cli.js";

describe("lint fact rendering", () => {
  it("maps a rule predicate to explicit machine-readable facts", () => {
    const document = toLintJsonDocument({
      summary: {
        findings: [
          {
            group: "workspace",
            ruleDescription: "Example state is valid.",
            displayRoot: ".",
            path: ".axm/settings.json",
            finding: {
              kind: "advisory",
              ruleId: "workspace/example-valid",
              severity: "error",
              message: "Observed state differs.",
              location: { file: ".axm/settings.json" },
            },
          },
        ],
        counts: { total: 1, errors: 1, warnings: 0, infos: 0 },
        exitCategory: "errors",
        driftBanner: [],
      },
      input: { view: "workspace" },
    });
    expect(document.findings[0]).toMatchObject({
      subject: ".axm/settings.json",
      authority: ".axm/settings.json",
      observed: "Observed state differs.",
      expected: "Example state is valid.",
    });
  });

  it("keeps strictness as exit policy without relabeling warnings", () => {
    expect(resolveLintExitCategory({ category: "warnings", strict: false })).toBe("success");
    expect(resolveLintExitCategory({ category: "warnings", strict: true })).toBe("fail");
  });

  it("emits the shared compatibility fact without translating its machine fields", () => {
    const compatibility = evaluateAxmSkillCompatibility({
      cliVersion: "2.0.0",
      skill: {
        manifestVersion: "1.0.0",
        source: "@agentxm/skills/axm@1.0.0",
        metadata: {
          [AXM_SKILL_CLI_VERSION_METADATA_KEY]: "1.0.0",
          [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.0.0 <2.0.0",
        },
      },
    });
    const document = toLintJsonDocument({
      summary: {
        findings: [],
        counts: { total: 0, errors: 0, warnings: 0, infos: 0 },
        exitCategory: "clean",
        driftBanner: [],
      },
      input: { view: "workspace" },
      axmSkillCompatibility: compatibility,
    });

    expect(document.axmSkillCompatibility).toEqual(compatibility);
  });
});

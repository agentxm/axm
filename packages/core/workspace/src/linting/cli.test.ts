import { renderAxmSkillCompatibility } from "@agentxm/cli-maintenance/official-skill/adapters/cli";
import { describe, expect, it } from "@effect/vitest";

import {
  resolveLintExitCategory,
  toLintHumanFindings,
  toLintJsonDocument,
  type RenderedFinding,
} from "./cli.js";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
} from "@agentxm/cli-maintenance/official-skill/domain";

describe("lint fact rendering", () => {
  it("maps a rule predicate to explicit machine-readable facts", () => {
    const document = toLintJsonDocument({
      summary: {
        findings: [
          {
            group: "workspace",
            ruleDescription: "Example state is valid.",
            displayRoot: ".",
            path: "axm.json",
            finding: {
              kind: "advisory",
              ruleId: "workspace/example-valid",
              severity: "error",
              message: "Observed state differs.",
              location: { file: "axm.json" },
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
      subject: "axm.json",
      authority: "axm.json",
      observed: "Observed state differs.",
      expected: "Example state is valid.",
    });
  });

  const finding = (
    ruleId: string,
    severity: "error" | "warning" | "info",
    message: string,
    path: string,
  ): RenderedFinding => ({
    group: "workspace",
    ruleDescription: `${ruleId} holds.`,
    displayRoot: ".",
    path,
    finding: { kind: "advisory", ruleId, severity, message, location: { file: path } },
  });

  it("marks a finding whose repair is determined as fixable", () => {
    const [human] = toLintHumanFindings([
      finding(
        "workspace/instructions-target-current",
        "warning",
        "The Claude Code instruction file is missing.",
        "./docs/CLAUDE.md",
      ),
    ]);
    expect(human?.fixable).toBe(true);
  });

  it("leaves a finding with no determined repair unfixable", () => {
    const [human] = toLintHumanFindings([
      finding(
        "workspace/settings-keys-recognized",
        "error",
        "Workspace settings has unrecognized top-level key 'rulesConfig'.",
        "./axm.json",
      ),
    ]);
    expect(human?.fixable).toBe(false);
  });

  it("puts errors first and splits a message into its title, detail, and help", () => {
    const humans = toLintHumanFindings([
      finding("workspace/a", "warning", "A warning.", "./a"),
      finding(
        "workspace/b",
        "error",
        "Lockfile is stale. Detail: 2 entries do not match axm.json. Run axm sync.",
        "./z",
      ),
    ]);
    expect(humans.map((human) => human.ruleId)).toEqual(["workspace/b", "workspace/a"]);
    expect(humans[0]).toMatchObject({
      title: "Lockfile is stale.",
      details: ["2 entries do not match axm.json."],
      helps: ["Run axm sync."],
      ruleDescription: "workspace/b holds.",
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

    expect(document.axmSkillCompatibility).toEqual(renderAxmSkillCompatibility(compatibility));
  });
});

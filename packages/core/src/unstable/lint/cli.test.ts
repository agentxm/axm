import { describe, expect, it } from "@effect/vitest";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
} from "../skills/axm-skill-compatibility.js";
import { resolveLintExitCategory, toLintHumanBlocks, toLintJsonDocument } from "./cli.js";

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

  it("names the determined repair for a missing instruction projection", () => {
    const blocks = toLintHumanBlocks({
      summary: {
        findings: [
          {
            group: "workspace",
            ruleDescription: "Configured agent instruction target files are current.",
            displayRoot: ".",
            path: "./docs/CLAUDE.md",
            finding: {
              kind: "advisory",
              ruleId: "workspace/instructions-target-current",
              severity: "warning",
              message: "The Claude Code instruction file is missing.",
              location: { file: "docs/CLAUDE.md" },
            },
          },
        ],
        counts: { total: 1, errors: 0, warnings: 1, infos: 0 },
        exitCategory: "warnings",
        driftBanner: [],
      },
      reporter: "grouped",
    });

    const diagnostics = blocks.flatMap((block) =>
      block.kind === "diagnostic" ? [block.diagnostic] : [],
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.fixable).toBe(true);
    expect(diagnostics[0]?.helps).toContain(
      "Fix: Run `axm lint --fix` to regenerate the instruction files from their canonical source.",
    );
  });

  it("leaves a finding with no determined repair unannotated", () => {
    const blocks = toLintHumanBlocks({
      summary: {
        findings: [
          {
            group: "workspace",
            ruleDescription: "Workspace settings keys are recognized.",
            displayRoot: ".",
            path: "./axm.json",
            finding: {
              kind: "advisory",
              ruleId: "workspace/settings-keys-recognized",
              severity: "error",
              message: "Workspace settings has unrecognized top-level key 'rulesConfig'.",
              location: { file: "axm.json" },
            },
          },
        ],
        counts: { total: 1, errors: 1, warnings: 0, infos: 0 },
        exitCategory: "errors",
        driftBanner: [],
      },
      reporter: "grouped",
    });

    const diagnostics = blocks.flatMap((block) =>
      block.kind === "diagnostic" ? [block.diagnostic] : [],
    );
    expect(diagnostics[0]?.fixable).toBe(false);
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

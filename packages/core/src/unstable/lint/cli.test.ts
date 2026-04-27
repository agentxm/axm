/**
 * Unit tests for the lint runner primitives consumed by `axm lint`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { LintConfig } from "./config.js";
import type { AdvisoryFinding, AutofixableFinding, LintFinding, Severity } from "./rule.js";
import type { Evaluated } from "./evaluate.js";
import type {
  PackFileAccessor,
  PackRuleContext,
  SkillFileAccessor,
  SkillRuleContext,
  WorkspaceRuleContext,
} from "./context.js";
import type { GroupEvaluations } from "./cli.js";
import {
  collectAutofixableEntries,
  collectRenderedFindings,
  countFindings,
  detectPublishGateDrift,
  renderFindingsText,
  resolveLintExitCategory,
  summarizeEvaluations,
  toLintHumanBlocks,
  toLintJsonDocument,
} from "./cli.js";

const makeEvaluated = <C>(rule: {
  id: string;
  severity: Severity;
  kind?: "advisory" | "autofixing";
}): ((context: C, findings: ReadonlyArray<LintFinding>) => Evaluated<C>) => {
  return (context, findings) => ({
    rule: {
      id: rule.id,
      description: rule.id,
      severity: rule.severity,
      kind: rule.kind ?? "advisory",
      check: () => Effect.succeed([]),
      ...(rule.kind === "autofixing" ? { fix: () => Effect.succeed([]) } : {}),
    } as Evaluated<C>["rule"],
    context,
    findings,
  });
};

const advisory = (
  ruleId: string,
  severity: Severity,
  location?: { file: string; line?: number },
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId,
  severity,
  message: `${ruleId} fired`,
  ...(location !== undefined ? { location } : {}),
});

const autofixable = (ruleId: string, severity: Severity): AutofixableFinding => ({
  kind: "autofixable",
  ruleId,
  severity,
  message: `${ruleId} fired`,
});

// Tests exercise pure summary/renderer helpers, so we use lightweight file
// accessor stubs and an unused workspace context.
const stubSkillAccessor: SkillFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: () => Effect.succeed(new Uint8Array()),
};
const stubPackAccessor: PackFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: () => Effect.succeed(new Uint8Array()),
};
const throwingWorkspace: WorkspaceRuleContext["workspace"] = {
  scope: () => {
    throw new Error("unused workspace context");
  },
  __debugCachedEffectCount: Effect.succeed(0),
};

const skillCtx: SkillRuleContext = {
  subject: { isNative: true, skillJson: undefined },
  files: stubSkillAccessor,
  packageFiles: stubSkillAccessor,
  displayRoot: ".axm/extensions/@acme/skills/demo/src",
};

const packCtx: PackRuleContext = {
  subject: { packJson: undefined },
  files: stubPackAccessor,
  displayRoot: ".axm/extensions/@acme/packs/demo",
};

const workspace: WorkspaceRuleContext = {
  subject: { root: "/ws", scope: "project" as const },
  workspace: throwingWorkspace,
  axmDirExists: Effect.succeed(false),
  displayRoot: "",
};

describe("detectPublishGateDrift", () => {
  it("flags publish-gate rules weakened to off / info / warn", () => {
    const config: LintConfig = {
      rules: {
        "skill/manifest-schema-valid": "off",
        "pack/manifest-schema-valid": "warn",
      },
    };
    expect(detectPublishGateDrift(config)).toEqual([
      "skill/manifest-schema-valid",
      "pack/manifest-schema-valid",
    ]);
  });

  it("does not flag workspace-only rule overrides", () => {
    const config: LintConfig = {
      rules: {
        "workspace/agents-detected-declared": "off",
        "workspace/skills-managed": "off",
      },
    };
    expect(detectPublishGateDrift(config)).toEqual([]);
  });

  it("does not flag a publish-gate rule raised above error", () => {
    // The config schema accepts any severity for any rule; a publish-gate rule
    // set to "error" matches the platform canonical default and is therefore
    // not weakened. Raising above error is impossible in v1 (error is the
    // ceiling) — this test guards against future accidental widening.
    const config: LintConfig = {
      rules: { "skill/manifest-schema-valid": "error" },
    };
    expect(detectPublishGateDrift(config)).toEqual([]);
  });

  it("returns an empty array for an empty rules map", () => {
    expect(detectPublishGateDrift({ rules: {} })).toEqual([]);
    expect(detectPublishGateDrift({})).toEqual([]);
  });
});

describe("resolveLintExitCategory", () => {
  it("is success when clean regardless of strict", () => {
    expect(resolveLintExitCategory({ category: "clean", strict: true })).toBe("success");
    expect(resolveLintExitCategory({ category: "clean", strict: false })).toBe("success");
  });

  it("is fail when errors are present regardless of strict", () => {
    expect(resolveLintExitCategory({ category: "errors", strict: false })).toBe("fail");
    expect(resolveLintExitCategory({ category: "errors", strict: true })).toBe("fail");
  });

  it("is fail for warnings only when strict is set", () => {
    expect(resolveLintExitCategory({ category: "warnings", strict: false })).toBe("success");
    expect(resolveLintExitCategory({ category: "warnings", strict: true })).toBe("fail");
  });
});

describe("countFindings and summarizeEvaluations", () => {
  it("counts errors/warnings/infos across groups", () => {
    const evaluations: GroupEvaluations = {
      skills: [
        makeEvaluated<SkillRuleContext>({ id: "skill/manifest-present", severity: "error" })(
          skillCtx,
          [advisory("skill/manifest-present", "error")],
        ),
      ],
      packs: [
        makeEvaluated<PackRuleContext>({ id: "pack/manifest-present", severity: "error" })(
          packCtx,
          [advisory("pack/manifest-present", "warning")],
        ),
      ],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/lockfile-valid",
          severity: "error",
          kind: "autofixing",
        })(workspace, [autofixable("workspace/lockfile-valid", "error")]),
      ],
    };
    const findings = collectRenderedFindings(evaluations);
    const counts = countFindings(findings);
    expect(counts).toEqual({ total: 3, errors: 2, warnings: 1, infos: 0 });

    const summary = summarizeEvaluations(evaluations, {});
    expect(summary.counts).toEqual({ total: 3, errors: 2, warnings: 1, infos: 0 });
    expect(summary.exitCategory).toBe("errors");
    expect(summary.driftBanner).toEqual([]);
  });

  it("is clean when no findings are present", () => {
    const evaluations: GroupEvaluations = { skills: [], packs: [], workspace: [] };
    const summary = summarizeEvaluations(evaluations, {});
    expect(summary.counts).toEqual({ total: 0, errors: 0, warnings: 0, infos: 0 });
    expect(summary.exitCategory).toBe("clean");
  });

  it("is warnings when only warning-severity findings are present", () => {
    const evaluations: GroupEvaluations = {
      skills: [],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/agents-detected-declared",
          severity: "warning",
        })(workspace, [advisory("workspace/agents-detected-declared", "warning")]),
      ],
    };
    const summary = summarizeEvaluations(evaluations, {});
    expect(summary.exitCategory).toBe("warnings");
  });
});

describe("renderFindingsText", () => {
  it("renders the default grouped reporter with overview, drift banner, and sections", () => {
    const evaluations: GroupEvaluations = {
      skills: [],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/lockfile-valid",
          severity: "error",
          kind: "autofixing",
        })(workspace, [autofixable("workspace/lockfile-valid", "error")]),
      ],
    };
    const summary = summarizeEvaluations(evaluations, {
      rules: { "skill/manifest-schema-valid": "off" },
    });
    const lines = renderFindingsText({ summary });
    expect(lines[0]).toBe("1 issue. 1 can be fixed automatically.");
    expect(lines).toContain("Auto-fixable (run `axm lint --fix`)");
    expect(lines).toContain("DRIFT: The registry will still block publish on these rules:");
    expect(lines).toContain("  - skill/manifest-schema-valid");
    expect(lines).toContain("  [error] .");
    expect(lines).toContain("  rule: workspace/lockfile-valid (auto-fixable)");
    expect(lines).toContain("  workspace/lockfile-valid fired");
    // Footer appears at the end, not under the overview
    expect(lines).toContain("More output: `axm lint --details` | `axm lint --json`");
    expect(lines.indexOf("More output: `axm lint --details` | `axm lint --json`")).toBeGreaterThan(
      lines.indexOf("  workspace/lockfile-valid fired"),
    );
  });

  it("prints 'No findings.' for an empty clean summary", () => {
    const summary = summarizeEvaluations({ skills: [], packs: [], workspace: [] }, {});
    const lines = renderFindingsText({ summary });
    expect(lines).toContain("No findings.");
  });

  it("appends the fix summary when provided", () => {
    const summary = summarizeEvaluations({ skills: [], packs: [], workspace: [] }, {});
    const lines = renderFindingsText({
      summary,
      fixSummary: { attempted: 2, applied: 2, failed: 0, warnings: ["lockfile rewrite"] },
    });
    expect(lines.some((line) => line.startsWith("Applied 2 fixes"))).toBe(true);
    expect(lines.some((line) => line.includes("lockfile rewrite"))).toBe(true);
  });
});

describe("toLintHumanBlocks", () => {
  it("builds grouped diagnostics by default", () => {
    const evaluations: GroupEvaluations = {
      skills: [
        makeEvaluated<SkillRuleContext>({ id: "skill/manifest-present", severity: "error" })(
          skillCtx,
          [
            {
              kind: "advisory",
              ruleId: "skill/manifest-present",
              severity: "warning",
              message: "manifest missing",
              location: { file: "skill.json" },
            },
          ],
        ),
      ],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/lockfile-valid",
          severity: "error",
          kind: "autofixing",
        })(workspace, [
          {
            kind: "autofixable",
            ruleId: "workspace/lockfile-valid",
            severity: "error",
            message: "lockfile missing",
            location: { file: ".axm/axm-lock.yaml" },
          },
        ]),
      ],
    };

    const summary = summarizeEvaluations(evaluations, {});
    const blocks = toLintHumanBlocks({ summary });

    expect(blocks[0]).toEqual({
      kind: "overview",
      message: "2 issues. 1 can be fixed automatically. 1 needs manual attention.",
      counts: { total: 2, errors: 1, warnings: 1, infos: 0 },
      notes: [],
    });
    expect(blocks[1]).toEqual({ kind: "blank" });
    expect(blocks[2]).toEqual({
      kind: "section",
      title: "Auto-fixable",
      note: "run `axm lint --fix`",
    });
    expect(blocks[3]).toEqual({
      kind: "diagnostic",
      diagnostic: {
        severity: "error",
        ruleId: "workspace/lockfile-valid",
        title: "lockfile missing",
        details: [],
        helps: [],
        fixable: true,
        paths: ["./.axm/axm-lock.yaml"],
      },
    });
    expect(blocks[4]).toEqual({ kind: "blank" });
    expect(blocks[5]).toEqual({ kind: "section", title: "Warnings" });
    expect(blocks[6]).toEqual({
      kind: "diagnostic",
      diagnostic: {
        severity: "warning",
        ruleId: "skill/manifest-present",
        title: "manifest missing",
        details: [],
        helps: [],
        fixable: false,
        paths: ["./.axm/extensions/@acme/skills/demo/src/skill.json"],
      },
    });
    // Footer at the end
    expect(blocks[blocks.length - 1]).toEqual({
      kind: "footer",
      message: "More output: `axm lint --details` | `axm lint --json`",
    });
  });

  it("builds an overview and path-grouped diagnostics for the full reporter", () => {
    const evaluations: GroupEvaluations = {
      skills: [
        makeEvaluated<SkillRuleContext>({ id: "skill/manifest-present", severity: "error" })(
          skillCtx,
          [
            {
              kind: "advisory",
              ruleId: "skill/manifest-present",
              severity: "warning",
              message: "manifest missing",
              location: { file: "skill.json" },
            },
          ],
        ),
      ],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/lockfile-valid",
          severity: "error",
          kind: "autofixing",
        })(workspace, [
          {
            kind: "autofixable",
            ruleId: "workspace/lockfile-valid",
            severity: "error",
            message: "lockfile missing",
            location: { file: ".axm/axm-lock.yaml" },
          },
        ]),
      ],
    };

    const summary = summarizeEvaluations(evaluations, {});
    const blocks = toLintHumanBlocks({ summary, reporter: "full" });

    expect(blocks[0]).toEqual({
      kind: "overview",
      message: "Found 1 error and 1 warning in 2 locations. 1 finding can be auto-fixed.",
      counts: { total: 2, errors: 1, warnings: 1, infos: 0 },
      notes: ["Next step: Run `axm lint --fix` for the auto-fixable findings."],
    });
    expect(blocks[1]).toEqual({
      kind: "blank",
    });
    expect(blocks[2]).toEqual({
      kind: "pathGroup",
      path: "./.axm/axm-lock.yaml",
      diagnostics: [
        {
          severity: "error",
          ruleId: "workspace/lockfile-valid",
          title: "lockfile missing",
          details: [],
          helps: [],
          fixable: true,
          paths: ["./.axm/axm-lock.yaml"],
        },
      ],
    });
    expect(blocks[3]).toEqual({
      kind: "blank",
    });
    expect(blocks[4]).toEqual({
      kind: "pathGroup",
      path: "./.axm/extensions/@acme/skills/demo/src/skill.json",
      diagnostics: [
        {
          severity: "warning",
          ruleId: "skill/manifest-present",
          title: "manifest missing",
          details: [],
          helps: [],
          fixable: false,
          paths: ["./.axm/extensions/@acme/skills/demo/src/skill.json"],
        },
      ],
    });
  });

  it("groups unmanaged skills by their actual workspace skill directory", () => {
    const evaluations: GroupEvaluations = {
      skills: [],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/skills-managed",
          severity: "error",
        })(workspace, [
          {
            kind: "advisory",
            ruleId: "workspace/skills-managed",
            severity: "error",
            message:
              "Skill 'alpha' is present here, but it is not managed by this workspace. " +
              "To keep it, run `axm skills install <source>` with the intended source for 'alpha'. " +
              "To remove it, run `axm prune` or `axm skills prune alpha`.",
            location: { file: ".agents/skills/alpha" },
          },
          {
            kind: "advisory",
            ruleId: "workspace/skills-managed",
            severity: "error",
            message:
              "Skill 'beta' is present here, but it is not managed by this workspace. " +
              "To keep it, run `axm skills install <source>` with the intended source for 'beta'. " +
              "To remove it, run `axm prune` or `axm skills prune beta`.",
            location: { file: ".agents/skills/beta" },
          },
        ]),
      ],
    };

    const summary = summarizeEvaluations(evaluations, {});
    const blocks = toLintHumanBlocks({ summary, reporter: "full" });

    expect(blocks[2]).toEqual({
      kind: "pathGroup",
      path: "./.agents/skills",
      diagnostics: [
        {
          severity: "error",
          ruleId: "workspace/skills-managed",
          title: "2 skills are present here but not managed by this workspace.",
          details: ["alpha", "beta"],
          helps: [
            "To keep them: run `axm skills install <source>` for each skill you want axm to manage.",
            "To remove them: run `axm prune` or `axm skills prune <name>`.",
          ],
          fixable: false,
          paths: ["./.agents/skills"],
        },
      ],
    });
  });

  it("keeps advisory findings from autofixing rules non-fixable and preserves their help", () => {
    const evaluations: GroupEvaluations = {
      skills: [],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/skills-integrity-valid",
          severity: "error",
          kind: "autofixing",
        })(workspace, [
          {
            kind: "advisory",
            ruleId: "workspace/skills-integrity-valid",
            severity: "error",
            message:
              "Pack-provided skill 'alpha' is listed in the lockfile, but its installed source files do not match the lockfile entry. " +
              "Detail: the installed source directory is missing. " +
              "Run `axm install` to reinstall it from the owning pack declarations.",
            location: { file: ".axm/axm-lock.yaml" },
          },
          {
            kind: "advisory",
            ruleId: "workspace/skills-integrity-valid",
            severity: "error",
            message:
              "Pack-provided skill 'beta' is listed in the lockfile, but its installed source files do not match the lockfile entry. " +
              "Detail: the installed source directory is missing. " +
              "Run `axm install` to reinstall it from the owning pack declarations.",
            location: { file: ".axm/axm-lock.yaml" },
          },
        ]),
      ],
    };

    const summary = summarizeEvaluations(evaluations, {});
    const blocks = toLintHumanBlocks({ summary });
    const diagnosticBlock = blocks.find(
      (block): block is Extract<(typeof blocks)[number], { kind: "diagnostic" }> =>
        block.kind === "diagnostic",
    );

    expect(diagnosticBlock).toEqual({
      kind: "diagnostic",
      diagnostic: {
        severity: "error",
        ruleId: "workspace/skills-integrity-valid",
        title: "Installed skill sources do not match their lockfile entries.",
        details: [
          "alpha: the installed source directory is missing.",
          "beta: the installed source directory is missing.",
        ],
        helps: ["Run `axm install` to reinstall it from the owning pack declarations."],
        fixable: false,
        paths: ["./.axm/axm-lock.yaml"],
      },
    });
  });
});

describe("toLintJsonDocument", () => {
  it("emits findings[], summary, and driftBanner", () => {
    const evaluations: GroupEvaluations = {
      skills: [],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/lockfile-valid",
          severity: "error",
          kind: "autofixing",
        })(workspace, [autofixable("workspace/lockfile-valid", "error")]),
      ],
    };
    const summary = summarizeEvaluations(evaluations, {
      rules: { "skill/manifest-schema-valid": "off" },
    });
    const doc = toLintJsonDocument({ summary });
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]?.ruleId).toBe("workspace/lockfile-valid");
    expect(doc.summary.exitCategory).toBe("errors");
    expect(doc.driftBanner).toEqual(["skill/manifest-schema-valid"]);
    expect(doc.fix).toBeUndefined();
  });

  it("includes the fix block when a fix summary is provided", () => {
    const summary = summarizeEvaluations({ skills: [], packs: [], workspace: [] }, {});
    const doc = toLintJsonDocument({
      summary,
      fixSummary: { attempted: 3, applied: 3, failed: 0, warnings: [] },
    });
    expect(doc.fix).toEqual({ attempted: 3, applied: 3, failed: 0, warnings: [] });
  });
});

describe("collectAutofixableEntries", () => {
  it("returns only autofixable findings from autofixing rules", () => {
    const evaluations: GroupEvaluations = {
      skills: [],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/lockfile-valid",
          severity: "error",
          kind: "autofixing",
        })(workspace, [
          autofixable("workspace/lockfile-valid", "error"),
          advisory("workspace/lockfile-valid", "error"),
        ]),
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/agents-recognized",
          severity: "error",
          kind: "advisory",
        })(workspace, [advisory("workspace/agents-recognized", "error")]),
      ],
    };
    const entries = collectAutofixableEntries(evaluations);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.rule.id).toBe("workspace/lockfile-valid");
    expect(entries[0]?.finding.kind).toBe("autofixable");
  });
});

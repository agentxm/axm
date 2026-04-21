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
  WorkspaceLintAccessor,
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
  suggestions: ["do a thing"],
  ...(location !== undefined ? { location } : {}),
});

const autofixable = (ruleId: string, severity: Severity): AutofixableFinding => ({
  kind: "autofixable",
  ruleId,
  severity,
  message: `${ruleId} fired`,
  suggestions: [`fix ${ruleId}`],
});

// Tests exercise pure summary/renderer helpers, so we use lightweight accessor
// stubs rather than the platform implementation (which requires FileSystem and
// Path services at construction time).
const stubSkillAccessor: SkillFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: () => Effect.succeed(new Uint8Array()),
};
const stubPackAccessor: PackFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: () => Effect.succeed(new Uint8Array()),
};
const stubWorkspaceAccessor: WorkspaceLintAccessor = {
  settings: Effect.succeed({}),
  lockfile: Effect.succeed({ _tag: "None" as const, value: undefined } as never),
  installedSkills: Effect.succeed([]),
  installedPacks: Effect.succeed([]),
  knownAgents: Effect.succeed([]),
  detectAgents: () => Effect.succeed([]),
  exists: () => Effect.succeed(false),
  isWritable: () => Effect.succeed(true),
  list: () => Effect.succeed([]),
};

const skillCtx: SkillRuleContext = {
  subject: { isNative: true, skillJson: undefined },
  files: stubSkillAccessor,
  displayRoot: ".axm/extensions/@acme/skills/demo/src",
};

const packCtx: PackRuleContext = {
  subject: { packJson: undefined },
  files: stubPackAccessor,
  displayRoot: ".axm/extensions/@acme/packs/demo",
};

const workspaceCtx: WorkspaceRuleContext = {
  subject: { root: "/ws", scope: "project" as const },
  workspace: stubWorkspaceAccessor,
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
        "workspace/skills-artifacts-clean": "off",
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
        })(workspaceCtx, [autofixable("workspace/lockfile-valid", "error")]),
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
        })(workspaceCtx, [advisory("workspace/agents-detected-declared", "warning")]),
      ],
    };
    const summary = summarizeEvaluations(evaluations, {});
    expect(summary.exitCategory).toBe("warnings");
  });
});

describe("renderFindingsText", () => {
  it("groups findings by context, sorts by severity, and renders the drift banner first", () => {
    const evaluations: GroupEvaluations = {
      skills: [],
      packs: [],
      workspace: [
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/lockfile-valid",
          severity: "error",
          kind: "autofixing",
        })(workspaceCtx, [autofixable("workspace/lockfile-valid", "error")]),
      ],
    };
    const summary = summarizeEvaluations(evaluations, {
      rules: { "skill/manifest-schema-valid": "off" },
    });
    const lines = renderFindingsText({ summary });
    expect(lines.some((line) => line.startsWith("DRIFT"))).toBe(true);
    expect(lines.some((line) => line.includes("skill/manifest-schema-valid"))).toBe(true);
    expect(lines.some((line) => line.startsWith("WORKSPACE"))).toBe(true);
    expect(lines.some((line) => line.includes("workspace/lockfile-valid"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Summary:"))).toBe(true);
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
        })(workspaceCtx, [autofixable("workspace/lockfile-valid", "error")]),
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
        })(workspaceCtx, [
          autofixable("workspace/lockfile-valid", "error"),
          advisory("workspace/lockfile-valid", "error"),
        ]),
        makeEvaluated<WorkspaceRuleContext>({
          id: "workspace/agents-recognized",
          severity: "error",
          kind: "advisory",
        })(workspaceCtx, [advisory("workspace/agents-recognized", "error")]),
      ],
    };
    const entries = collectAutofixableEntries(evaluations);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.rule.id).toBe("workspace/lockfile-valid");
    expect(entries[0]?.finding.kind).toBe("autofixable");
  });
});

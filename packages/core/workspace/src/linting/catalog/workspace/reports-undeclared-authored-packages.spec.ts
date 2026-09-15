import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { fixProject, lintProject, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-undeclared-authored-packages",
  title: "Lint reports authored packages that are not declared",
  statement:
    "When a project workspace's standard authoring folder for an extension type holds a package whose valid manifest matches its path identity and settings hold no declaration for it, enabled or disabled, lint shall report one warning under workspace/authored-package-declared stating its identity, type, authoring path, and manifest version, shall not report that package under workspace/managed-file-unowned, shall not report a lookalike with a missing, invalid, or mismatched manifest as undeclared, and lint --fix shall not add a declaration.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Authored packages, their manifests, and settings are real files; production lint and lint --fix observe them and the settings document on disk.",
  derivedFrom: ["cli/lint/authored-skills-are-not-agent-output"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const manifest = (type: string, name: string, version = "1.0.0", owner = "@acme") =>
  JSON.stringify({ owner, type, name, version, description: "Fixture" });
const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture\n---\n# Skill\n`;

const rules = {
  ...isolatedLintRules("workspace/authored-package-declared", undefined),
  "workspace/managed-file-unowned": "warn",
};

const settings = {
  owner: "@acme",
  skills: {
    declared: "workspace",
    paused: { source: "workspace", enabled: false },
  },
  lint: { rules },
};

describe("Undeclared authored packages", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const arrange = () => {
    const workspace = makeLintWorkspace({
      settings,
      files: {
        "skills/declared/skill.json": manifest("skill", "declared"),
        "skills/declared/src/SKILL.md": skill("declared"),
        "skills/paused/skill.json": manifest("skill", "paused"),
        "skills/paused/src/SKILL.md": skill("paused"),
        "skills/draft/skill.json": manifest("skill", "draft", "0.3.0"),
        "skills/draft/src/SKILL.md": skill("draft"),
        "rules/style/rule.json": manifest("rule", "style", "2.0.0"),
        "rules/style/src/RULE.md": "# Style\n",
        "skills/broken/skill.json": "{broken",
        "skills/broken/src/SKILL.md": skill("broken"),
        "skills/foreign/skill.json": manifest("skill", "foreign", "1.0.0", "@other"),
        "skills/foreign/src/SKILL.md": skill("foreign"),
        "skills/bare/SKILL.md": skill("bare"),
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const rows = (
    findings: ReadonlyArray<{
      readonly ruleId: string;
      readonly message: string;
      readonly location?: { readonly file?: string } | undefined;
    }>,
  ) =>
    findings
      .map(({ ruleId, message, location }) => ({ ruleId, message, file: location?.file }))
      .sort((left, right) =>
        `${left.ruleId}${left.file}`.localeCompare(`${right.ruleId}${right.file}`),
      );

  const expected = [
    {
      ruleId: "workspace/authored-package-declared",
      message:
        "Authored rule '@acme/rules/style' version 2.0.0 at rules/style is not declared in axm.json.",
      file: "rules/style",
    },
    {
      ruleId: "workspace/authored-package-declared",
      message:
        "Authored skill '@acme/skills/draft' version 0.3.0 at skills/draft is not declared in axm.json.",
      file: "skills/draft",
    },
  ];

  it.effect(
    "reports only valid undeclared packages and keeps lookalikes out of the undeclared report",
    () => {
      const workspace = arrange();
      return Effect.gen(function* () {
        const before = workspace.snapshot();
        const { document } = yield* lintProject(workspace);
        const reported = rows(document.findings);
        expect(
          reported.filter((row) => row.ruleId === "workspace/authored-package-declared"),
        ).toEqual(expected);
        expect(
          reported
            .filter((row) => row.ruleId === "workspace/managed-file-unowned")
            .map((row) => row.file),
        ).toEqual(["skills/bare", "skills/broken", "skills/foreign"]);
        expect(workspace.snapshot()).toEqual(before);
      }).pipe(Effect.provide(lintServices(workspace)));
    },
  );

  it.effect("lint --fix adds no declaration", () => {
    const workspace = arrange();
    return Effect.gen(function* () {
      const settingsBefore = workspace.readFile("axm.json");
      const { document } = yield* fixProject(workspace);
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(
        rows(document.findings).filter(
          (row) => row.ruleId === "workspace/authored-package-declared",
        ),
      ).toEqual(expected);
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});

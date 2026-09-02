import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach } from "vitest";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

import { allCatalogRuleIds, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { writeLocalSkillPackage } from "../../support/install-harness.js";
import {
  installBundledAxmSkill,
  makeLintSpecWorkspace,
  runProjectLint,
} from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/official-skill-findings-follow-declared-intent",
  title: "Lint reports the official AXM skill against what the workspace declared",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table"],
});

const officialSkillRuleIds = new Set([
  "workspace/axm-skill-declared",
  "workspace/axm-skill-compatible",
]);

const isolateOfficialSkillRules = (): Record<string, "off"> =>
  Object.fromEntries(
    allCatalogRuleIds.flatMap((ruleId) =>
      officialSkillRuleIds.has(ruleId) ? [] : [[ruleId, "off" as const]],
    ),
  );

type WorkspaceState =
  | "undeclared"
  | "non-official"
  | "official-missing"
  | "official-skewed"
  | "official-compatible"
  | "official-unreadable";

const cases: ReadonlyArray<{
  readonly state: WorkspaceState;
  readonly findings: ReadonlyArray<readonly [ruleId: string, severity: string]>;
  readonly compatibilityPresent: boolean;
  readonly reasonCode?: string;
  readonly succeeds: boolean;
}> = [
  {
    state: "undeclared",
    findings: [["workspace/axm-skill-declared", "info"]],
    compatibilityPresent: false,
    succeeds: true,
  },
  {
    state: "non-official",
    findings: [["workspace/axm-skill-declared", "info"]],
    compatibilityPresent: false,
    succeeds: true,
  },
  {
    state: "official-missing",
    findings: [["workspace/axm-skill-compatible", "error"]],
    compatibilityPresent: true,
    reasonCode: "axm-skill-missing",
    succeeds: false,
  },
  {
    state: "official-skewed",
    findings: [["workspace/axm-skill-compatible", "error"]],
    compatibilityPresent: true,
    reasonCode: "skill-release-mismatch",
    succeeds: false,
  },
  {
    state: "official-compatible",
    findings: [],
    compatibilityPresent: true,
    succeeds: true,
  },
  {
    state: "official-unreadable",
    findings: [["workspace/axm-skill-compatible", "error"]],
    compatibilityPresent: true,
    succeeds: false,
  },
];

describe("Official AXM skill lint findings", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)("follow declared intent for $state", (testCase) =>
    Effect.gen(function* () {
      const workspace = makeLintSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          lint: { rules: isolateOfficialSkillRules() },
          ...(testCase.state === "official-missing"
            ? { skills: { axm: "agentxm:@agentxm/skills/axm" } }
            : {}),
        },
      });
      cleanups.push(workspace.cleanup);

      switch (testCase.state) {
        case "non-official": {
          const skillPackage = writeLocalSkillPackage(workspace.root, {
            name: "axm",
            owner: "@acme",
          });
          yield* handleInstall({
            source: Option.some(skillPackage),
            yes: true,
            force: false,
            preview: false,
          }).pipe(Effect.provide(workspace.layer));
          break;
        }
        case "official-skewed":
        case "official-compatible":
        case "official-unreadable":
          yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
          break;
        case "undeclared":
        case "official-missing":
          break;
      }

      const officialSkillRoot = path.join(
        workspace.root,
        "agent_extensions",
        "agentxm",
        "@agentxm",
        "skills",
        "axm",
      );
      if (testCase.state === "official-skewed") {
        const manifestPath = path.join(officialSkillRoot, "skill.json");
        const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
          return yield* Effect.die("Expected the bundled AXM skill manifest to be an object");
        }
        fs.writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version: "0.0.1" })}\n`);
      }
      if (testCase.state === "official-unreadable") {
        fs.rmSync(path.join(officialSkillRoot, "src", "SKILL.md"));
      }

      const result = yield* runProjectLint(workspace, false);
      expect(result.result.findings.map(({ ruleId, severity }) => [ruleId, severity])).toEqual(
        testCase.findings,
      );
      expect(result.result.summary.exitCategory).toBe(testCase.succeeds ? "clean" : "errors");
      expect(result.ok).toBe(testCase.succeeds);
      expect(Exit.isSuccess(result.exit)).toBe(testCase.succeeds);
      expect(Object.hasOwn(result.result, "axmSkillCompatibility")).toBe(
        testCase.compatibilityPresent,
      );
      if (testCase.reasonCode !== undefined) {
        expect(result.result.axmSkillCompatibility?.reasonCode).toBe(testCase.reasonCode);
      }
    }),
  );
});

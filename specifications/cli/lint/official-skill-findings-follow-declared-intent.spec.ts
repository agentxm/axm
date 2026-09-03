import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach } from "vitest";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import YAML from "yaml";

import {
  LOCKFILE_VERSION,
  allCatalogRuleIds,
  computeMaterializedTreeIntegritySync,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalSkillPackage } from "../../support/install-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";
import {
  installBundledAxmSkill,
  makeLintSpecWorkspace,
  runProjectLint,
} from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/official-skill-findings-follow-declared-intent",
  title: "Lint reports the official AXM skill against what the workspace declared",
  statement:
    "Lint shall report the official AXM skill as an informational finding when the workspace does not declare it, as a compatibility error with a reason and recovery action when the declared skill is missing, incompatible, skewed, authored, or unreadable, and as clean when compatible.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  status: "accepted",
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The reason code reported for the authored and unreadable official-skill states is not pinned by the decision table, while every other error state pins one.",
  ],
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
  | "official-registry"
  | "official-skewed"
  | "official-authored"
  | "official-compatible"
  | "official-unreadable";

const cases: ReadonlyArray<{
  readonly state: WorkspaceState;
  readonly findings: ReadonlyArray<readonly [ruleId: string, severity: string]>;
  readonly compatibilityPresent: boolean;
  readonly reasonCode?: string;
  readonly recoveryAction?: string;
  readonly nextAction?: string | null;
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
    recoveryAction: "install-bundled-skill",
    nextAction: "axm skills install @agentxm/skills/axm --bundled --preview",
    succeeds: false,
  },
  {
    state: "official-registry",
    findings: [["workspace/axm-skill-compatible", "error"]],
    compatibilityPresent: true,
    reasonCode: "cli-version-incompatible",
    recoveryAction: "update-registry-skill",
    nextAction: "axm skills update --name axm --preview",
    succeeds: false,
  },
  {
    state: "official-skewed",
    findings: [["workspace/axm-skill-compatible", "error"]],
    compatibilityPresent: true,
    reasonCode: "skill-release-mismatch",
    recoveryAction: "install-bundled-skill",
    nextAction: "axm skills install @agentxm/skills/axm --bundled --preview",
    succeeds: false,
  },
  {
    state: "official-authored",
    findings: [["workspace/axm-skill-compatible", "error"]],
    compatibilityPresent: true,
    recoveryAction: "preserve-authored-skill",
    nextAction: "axm help upgrade",
    succeeds: false,
  },
  {
    state: "official-compatible",
    findings: [],
    compatibilityPresent: true,
    recoveryAction: "none",
    nextAction: null,
    succeeds: true,
  },
  {
    state: "official-unreadable",
    findings: [["workspace/axm-skill-compatible", "error"]],
    compatibilityPresent: true,
    recoveryAction: "install-bundled-skill",
    nextAction: "axm skills install @agentxm/skills/axm --bundled --preview",
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
          ...(testCase.state === "official-missing" || testCase.state === "official-registry"
            ? { skills: { axm: "agentxm:@agentxm/skills/axm" } }
            : testCase.state === "official-authored"
              ? { skills: { axm: "workspace" } }
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
        case "official-authored":
          writeAuthoredSkill(workspace.root, { name: "axm", version: "0.0.1" });
          break;
        case "official-registry":
          {
            const packageRoot = path.join(
              workspace.root,
              "agent_extensions",
              "agentxm",
              "@agentxm",
              "skills",
              "axm",
            );
            fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
            fs.writeFileSync(
              path.join(packageRoot, "skill.json"),
              `${JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "0.0.1" })}\n`,
            );
            fs.writeFileSync(
              path.join(packageRoot, "src", "SKILL.md"),
              `---\nname: axm\ndescription: Registry official skill.\nmetadata:\n  axm.sh/cli-version: "0.0.1"\n  axm.sh/cli-version-range: "0.0.1"\n---\n\n# AXM\n`,
            );
            fs.writeFileSync(
              path.join(workspace.root, "axm-lock.yaml"),
              YAML.stringify({
                lockfileVersion: LOCKFILE_VERSION,
                skills: {
                  axm: {
                    type: "registry",
                    sourceType: "registry",
                    endpoint: "https://registry.agentxm.ai/",
                    extensionType: "skill",
                    workspaceName: "axm",
                    packageFormat: "agentxm",
                    owner: "@agentxm",
                    name: "axm",
                    resolvedVersion: "0.0.1",
                    integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
                    sourceName: "agentxm",
                    publisherBindingId: "hbnd_agentxm",
                    treeIntegrity: computeMaterializedTreeIntegritySync(packageRoot),
                  },
                },
              }),
            );
          }
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
      if (testCase.recoveryAction !== undefined) {
        expect(result.result.axmSkillCompatibility?.recovery).toMatchObject({
          action: testCase.recoveryAction,
          nextAction: testCase.nextAction,
        });
      }
    }),
  );
});

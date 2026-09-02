/** Direct satisfied/violated evidence for settings-backed workspace rules. */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeWorkspaceReadModel } from "@agentxm/workspace-state";
import { WorkspaceReadModelTest, type ScopeFiles } from "@agentxm/workspace-state/testing";
import type { LintRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { agentsRecognizedRule } from "./agents-recognized.js";
import { initializedRule } from "./initialized.js";
import { lockfileValidRule } from "./lockfile-valid.js";
import { mcpServerNoSecretLiteralRule } from "./mcps-no-secret-literal.js";
import { mcpServerTransportExclusivityRule } from "./mcps-transport-exclusivity.js";
import { packsDeclarationsValidRule } from "./packs-declarations-valid.js";
import { settingsSchemaValidRule } from "./settings-schema-valid.js";
import { skillsDeclarationsValidRule } from "./skills-declarations-valid.js";

interface WorkspaceRuleConformanceCase {
  readonly ruleId: string;
  readonly rule: LintRule<WorkspaceRuleContext>;
  readonly satisfied: ScopeFiles;
  readonly violated: ScopeFiles;
  readonly makeViolated?: () => Effect.Effect<WorkspaceRuleContext>;
  readonly inapplicable?: ScopeFiles;
  readonly location: string;
}

const validLockfile = {
  _tag: "valid" as const,
  contents: { lockfileVersion: 6, skills: {} },
};

const validSettings = (contents: object = { agents: ["claude-code"] }) => ({
  _tag: "valid" as const,
  contents,
});

const contextFor = (project: ScopeFiles) =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/workspace", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/workspace",
        userHome: "/home/test",
        project,
      }),
    ),
    Effect.orDie,
  );

const unrecognizedAgentContext = () =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          // Keep a schema-valid declared agent while narrowing the catalog to
          // exercise this rule's defensive recognition branch directly.
          workspace: {
            ...context.workspace,
            agents: {
              ...context.workspace.agents,
              known: Effect.succeed([]),
            },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

const cases: ReadonlyArray<WorkspaceRuleConformanceCase> = [
  {
    ruleId: "workspace/initialized",
    rule: initializedRule,
    satisfied: { settings: validSettings(), lockfile: validLockfile },
    violated: { settings: { _tag: "absent" }, lockfile: { _tag: "absent" } },
    location: "axm.json",
  },
  {
    ruleId: "workspace/settings-schema-valid",
    rule: settingsSchemaValidRule,
    satisfied: { settings: validSettings(), lockfile: validLockfile },
    violated: {
      settings: { _tag: "schemaInvalid", contents: { agents: "claude-code" } },
      lockfile: validLockfile,
    },
    inapplicable: { settings: { _tag: "absent" }, lockfile: { _tag: "absent" } },
    location: "axm.json",
  },
  {
    ruleId: "workspace/lockfile-valid",
    rule: lockfileValidRule,
    satisfied: {
      settings: validSettings({
        agents: ["claude-code"],
        skills: { demo: "@acme/skills/demo" },
      }),
      lockfile: validLockfile,
    },
    violated: {
      settings: validSettings({
        agents: ["claude-code"],
        skills: { demo: "@acme/skills/demo" },
      }),
      lockfile: { _tag: "absent" },
    },
    inapplicable: {
      settings: validSettings(),
      lockfile: { _tag: "absent" },
    },
    location: "axm-lock.yaml",
  },
  {
    ruleId: "workspace/agents-recognized",
    rule: agentsRecognizedRule,
    satisfied: { settings: validSettings(), lockfile: validLockfile },
    violated: {
      settings: validSettings({ agents: ["not-an-agent"] }),
      lockfile: validLockfile,
    },
    makeViolated: unrecognizedAgentContext,
    inapplicable: {
      settings: { _tag: "schemaInvalid", contents: { agents: "not-an-agent" } },
      lockfile: validLockfile,
    },
    location: "axm.json",
  },
  {
    ruleId: "workspace/skills-declarations-valid",
    rule: skillsDeclarationsValidRule,
    satisfied: {
      settings: validSettings({ skills: { demo: "@acme/skills/demo" } }),
      lockfile: validLockfile,
    },
    violated: {
      settings: validSettings({ skills: { demo: "just-a-name" } }),
      lockfile: validLockfile,
    },
    inapplicable: {
      settings: { _tag: "schemaInvalid", contents: { skills: "invalid" } },
      lockfile: validLockfile,
    },
    location: "axm.json",
  },
  {
    ruleId: "workspace/packs-declarations-valid",
    rule: packsDeclarationsValidRule,
    satisfied: {
      settings: validSettings({ packs: { base: "@acme/packs/base" } }),
      lockfile: validLockfile,
    },
    violated: {
      settings: validSettings({ packs: { base: "just-a-name" } }),
      lockfile: validLockfile,
    },
    inapplicable: {
      settings: { _tag: "schemaInvalid", contents: { packs: "invalid" } },
      lockfile: validLockfile,
    },
    location: "axm.json",
  },
  {
    ruleId: "workspace/mcps-transport-exclusivity",
    rule: mcpServerTransportExclusivityRule,
    satisfied: {
      settings: validSettings({ mcpServers: { demo: { command: "node", args: [] } } }),
      lockfile: validLockfile,
    },
    violated: {
      settings: validSettings({
        mcpServers: { demo: { command: "node", url: "https://example.test/mcp" } },
      }),
      lockfile: validLockfile,
    },
    inapplicable: {
      settings: { _tag: "schemaInvalid", contents: { mcpServers: "invalid" } },
      lockfile: validLockfile,
    },
    location: "axm.json",
  },
  {
    ruleId: "workspace/mcps-no-secret-literal",
    rule: mcpServerNoSecretLiteralRule,
    satisfied: {
      settings: validSettings({
        mcpServers: { demo: { command: "node", env: { API_TOKEN: "${API_TOKEN}" } } },
      }),
      lockfile: validLockfile,
    },
    violated: {
      settings: validSettings({
        mcpServers: { demo: { command: "node", env: { API_TOKEN: "literal-secret" } } },
      }),
      lockfile: validLockfile,
    },
    inapplicable: {
      settings: { _tag: "schemaInvalid", contents: { mcpServers: "invalid" } },
      lockfile: validLockfile,
    },
    location: "axm.json",
  },
];

describe("settings-backed workspace rule conformance", () => {
  it("registers each conformance rule once", () => {
    const ids = cases.map(({ ruleId }) => ruleId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cases.map(({ rule }) => rule.id)).toEqual(ids);
  });

  for (const testCase of cases) {
    it.effect(`${testCase.rule.id} has satisfied and violated evidence`, () =>
      Effect.gen(function* () {
        const satisfied = yield* contextFor(testCase.satisfied);
        expect(yield* testCase.rule.check(satisfied)).toEqual([]);

        const violated = yield* testCase.makeViolated?.() ?? contextFor(testCase.violated);
        const findings = yield* testCase.rule.check(violated);
        expect(findings.length).toBeGreaterThan(0);
        for (const finding of findings) {
          expect(finding.ruleId).toBe(testCase.rule.id);
          expect(finding.kind).toBe(testCase.rule.kind);
          expect(finding.severity).toBe(testCase.rule.severity);
          expect(finding.message.length).toBeGreaterThan(0);
          expect(finding.location?.file).toBe(testCase.location);
        }

        if (testCase.inapplicable !== undefined) {
          const inapplicable = yield* contextFor(testCase.inapplicable);
          expect(yield* testCase.rule.check(inapplicable)).toEqual([]);
        }
      }),
    );
  }
});

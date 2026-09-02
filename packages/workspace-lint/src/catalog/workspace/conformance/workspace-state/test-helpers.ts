import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  type AgentOutputInventory,
  evaluateAxmSkillCompatibility,
  type ProjectionInvariantFact,
} from "@agentxm/extension-workspace";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { agentsDetectedDeclaredRule } from "../../agents-detected-declared.js";
import { agentsProjectionsStaleRule } from "../../agents-projections-stale.js";
import { axmSkillDeclaredRule } from "../../axm-skill-declared.js";
import { axmSkillCompatibleRule } from "../../axm-skill-compatible.js";
import { hookOwnershipAmbiguousRule } from "../../hook-ownership-ambiguous.js";
import { knowledgeStateValidRule } from "../../knowledge-state-valid.js";
import { managedFileUnownedRule } from "../../managed-file-unowned.js";
import { projectionOwnershipValidRule } from "../../projection-ownership-valid.js";
import { settingsKeysRecognizedRule } from "../../settings-keys-recognized.js";
import {
  contextFor,
  validLockfile,
  validSettings,
  type WorkspaceRuleConformanceCase,
} from "../test-helpers.js";

export const settingsKeysRecognizedConformance: WorkspaceRuleConformanceCase = {
  rule: settingsKeysRecognizedRule,
  satisfied: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
  violated: () =>
    contextFor({ settings: validSettings({ telemetry: false }), lockfile: validLockfile }),
  expectedFindings: [
    {
      message:
        "Workspace settings has unrecognized top-level key 'telemetry'. The current settings schema does not recognize this key.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: { _tag: "absent" }, lockfile: { _tag: "absent" } }),
};

const detectedAgentContext = (present: boolean) =>
  contextFor({ settings: validSettings({ agents: [] }), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          workspace: {
            ...context.workspace,
            agents: {
              ...context.workspace.agents,
              detected: Effect.succeed(
                present
                  ? [
                      {
                        scope: "project",
                        agentId: "cursor",
                        status: "unmanaged-present",
                        present: true,
                        declared: Option.none(),
                        actual: Option.none(),
                      },
                    ]
                  : [],
              ),
            },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const agentsDetectedDeclaredConformance: WorkspaceRuleConformanceCase = {
  rule: agentsDetectedDeclaredRule,
  satisfied: () => detectedAgentContext(false),
  violated: () => detectedAgentContext(true),
  expectedFindings: [
    {
      message: "Agent 'cursor' is present on disk but missing from `settings.agents[]`.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () =>
    detectedAgentContext(true).pipe(
      Effect.map(
        (context) =>
          ({
            ...context,
            subject: { root: "/workspace", scope: "user" },
          }) satisfies WorkspaceRuleContext,
      ),
    ),
};

const staleAgentProjection: AgentOutputInventory["ownedResidue"][number] = {
  extensionType: "skill",
  containerPath: "/workspace/.agents/skills",
  path: "/workspace/.agents/skills/review",
  entryName: "review",
  claimantAgentIds: ["universal"],
  ownership: "owned",
  proof: "managed-banner",
  desired: false,
};

const agentProjectionContext = (ownedResidue: AgentOutputInventory["ownedResidue"]) =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          agentOutputs: Effect.succeed({
            outputs: ownedResidue,
            ownedResidue,
            unownedFootprints: [],
          }),
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const agentsProjectionsStaleConformance: WorkspaceRuleConformanceCase = {
  rule: agentsProjectionsStaleRule,
  satisfied: () => agentProjectionContext([]),
  violated: () => agentProjectionContext([staleAgentProjection]),
  expectedFindings: [
    {
      message: "AXM-owned skill projection 'review' is no longer desired.",
      location: { file: "/workspace/.agents/skills/review" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const ownershipContext = (
  issues: ReadonlyArray<{
    readonly kind: "hook-ownership-ambiguous" | "managed-file-unowned";
    readonly path: string;
    readonly detail: string;
  }>,
) =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({ ...context, ownership: Effect.succeed(issues) }) satisfies WorkspaceRuleContext,
    ),
  );

export const hookOwnershipAmbiguousConformance: WorkspaceRuleConformanceCase = {
  rule: hookOwnershipAmbiguousRule,
  satisfied: () => ownershipContext([]),
  violated: () =>
    ownershipContext([
      {
        kind: "hook-ownership-ambiguous",
        path: "/workspace/.claude/settings.json",
        detail: "Hook command targets agent_extensions/ without x-axm ownership metadata.",
      },
    ]),
  expectedFindings: [
    {
      message: "Hook command targets agent_extensions/ without x-axm ownership metadata.",
      location: { file: ".claude/settings.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

export const managedFileUnownedConformance: WorkspaceRuleConformanceCase = {
  rule: managedFileUnownedRule,
  satisfied: () => ownershipContext([]),
  violated: () =>
    ownershipContext([
      {
        kind: "managed-file-unowned",
        path: "/workspace/.claude/agents/manual.md",
        detail: "Agent subagent artifact has no structured file ownership proof.",
      },
    ]),
  expectedFindings: [
    {
      message: "Agent subagent artifact has no structured file ownership proof.",
      location: { file: ".claude/agents/manual.md" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const projectionContext = (ownershipValid: boolean) =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          projections: {
            facts: Effect.succeed([
              {
                predicate: "workspace/projection-current",
                subject: {
                  unitId: "rule:instructions-region",
                  path: "AGENTS.md#rules",
                  scope: "project",
                  owner: "@agentxm/rules/instructions",
                },
                authority: {
                  source: "desired-state-graph",
                  contributors: ["@acme/rules/alpha", "@acme/rules/beta"],
                },
                observation: ownershipValid
                  ? { status: "current", contributors: ["@acme/rules/alpha", "@acme/rules/beta"] }
                  : {
                      status: "unavailable",
                      contributors: [],
                      reasonCode: "invalid-ownership",
                      message: "AXM managed region AGENTS.md has malformed ownership markers.",
                    },
                expectation: {
                  status: "current",
                  contributors: ["@acme/rules/alpha", "@acme/rules/beta"],
                },
                affectedContributors: ownershipValid
                  ? []
                  : ["@acme/rules/alpha", "@acme/rules/beta"],
              } satisfies ProjectionInvariantFact,
            ]),
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const projectionOwnershipValidConformance: WorkspaceRuleConformanceCase = {
  rule: projectionOwnershipValidRule,
  satisfied: () => projectionContext(true),
  violated: () => projectionContext(false),
  expectedFindings: [
    {
      message: "AXM managed region AGENTS.md has malformed ownership markers.",
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const skillCompatibility = (cliVersion: string) =>
  evaluateAxmSkillCompatibility({
    cliVersion,
    skill: {
      manifestVersion: "1.1.0",
      source: "@agentxm/skills/axm@1.1.0",
      metadata: {
        [AXM_SKILL_CLI_VERSION_METADATA_KEY]: "1.1.0",
        [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.1.0 <1.2.0",
      },
    },
  });

const axmSkillContext = (cliVersion: string) =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          axmSkillCompatibility: Effect.succeed(Option.some(skillCompatibility(cliVersion))),
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const axmSkillCompatibleConformance: WorkspaceRuleConformanceCase = {
  rule: axmSkillCompatibleRule,
  satisfied: () => axmSkillContext("1.1.3"),
  violated: () => axmSkillContext("1.2.3"),
  expectedFindings: [
    {
      message:
        "AXM CLI 1.2.3 is outside the official AXM skill range >=1.1.0 <1.2.0. Reason: cli-version-incompatible. Target: AXM CLI 1.2.3 + official AXM skill 1.2.3. Next: `axm skills update --name axm --preview`.",
      location: { file: "skills/axm" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const axmSkillDeclarationContext = (declared: boolean) =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          axmSkillCompatibility: Effect.succeed(
            declared ? Option.some(skillCompatibility("1.1.3")) : Option.none(),
          ),
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const axmSkillDeclaredConformance: WorkspaceRuleConformanceCase = {
  rule: axmSkillDeclaredRule,
  satisfied: () => axmSkillDeclarationContext(true),
  violated: () => axmSkillDeclarationContext(false),
  expectedFindings: [
    {
      message:
        "This workspace does not declare the official AXM skill. Install it with `axm skills install @agentxm/skills/axm --bundled`.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const knowledgeFiles = {
  "agentxm/@acme/knowledge/handbook/knowledge.json": JSON.stringify({
    owner: "@acme",
    type: "knowledge",
    name: "handbook",
    version: "1.0.0",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  }),
  "agentxm/@acme/knowledge/handbook/src/index.md": "# Handbook\n",
};

export const knowledgeStateValidConformance: WorkspaceRuleConformanceCase = {
  rule: knowledgeStateValidRule,
  satisfied: () =>
    contextFor({
      settings: validSettings(),
      lockfile: {
        _tag: "valid",
        contents: {
          lockfileVersion: 7,
          skills: {},
          knowledge: {
            handbook: {
              type: "local",
              sourceType: "local",
              sourceName: "local",
              extensionType: "knowledge",
              workspaceName: "handbook",
              packageFormat: "agentxm",
              packageOwner: "@acme",
              packageName: "handbook",
              path: "knowledge-source",
              contentIdentity: "accepted-content",
              treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
            },
          },
        },
      },
      axmExtensions: knowledgeFiles,
    }),
  violated: () =>
    contextFor({
      settings: validSettings(),
      lockfile: { _tag: "absent" },
      axmExtensions: knowledgeFiles,
    }),
  expectedFindings: [
    {
      message:
        "Knowledge bundle 'handbook' has canonical content without an accepted AXM ownership fact.",
      location: { file: "agent_extensions" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

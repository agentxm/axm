import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  ActualSkill,
  DesiredExtensionNode,
  InstalledSkill,
  InstalledSubagent,
} from "@agentxm/workspace-state";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { configuredButNotInstalledRule } from "../../configured-but-not-installed.js";
import { skillsLockfileAlignedRule } from "../../skills-lockfile-aligned.js";
import { skillsIntegrityValidRule } from "../../skills-integrity-valid.js";
import { skillsArtifactsCorrectRule } from "../../skills-artifacts-correct.js";
import {
  contextFor,
  validLockfile,
  validSettings,
  type WorkspaceRuleConformanceCase,
} from "../test-helpers.js";

const configuredSubagent = (canonicalPresent: boolean): InstalledSubagent => ({
  key: { scope: "project", type: "subagent", name: decodeExtensionNameSync("reviewer") },
  installationOrigin: {
    _tag: "direct",
    declared: {
      name: decodeExtensionNameSync("reviewer"),
      entry: { source: "@acme/subagents/reviewer", enabled: true },
    },
  },
  activation: "enabled",
  resolved: Option.none(),
  actual: canonicalPresent
    ? [
        {
          key: { scope: "project", type: "subagent", name: decodeExtensionNameSync("reviewer") },
          origin: { _tag: "canonical-axm-subagent" },
          contentRoot: "/workspace/agent_extensions/agentxm/@acme/subagents/reviewer/src",
          sourcePath:
            "/workspace/agent_extensions/agentxm/@acme/subagents/reviewer/src/reviewer.md",
          packageRoot: "/workspace/agent_extensions/agentxm/@acme/subagents/reviewer",
        },
      ]
    : [],
  providingPacks: [],
});

const configuredSubagentContext = (canonicalPresent: boolean) =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          workspace: {
            ...context.workspace,
            subagents: {
              ...context.workspace.subagents,
              installed: Effect.succeed([configuredSubagent(canonicalPresent)]),
            },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const configuredButNotInstalledConformance: WorkspaceRuleConformanceCase = {
  rule: configuredButNotInstalledRule,
  satisfied: () => configuredSubagentContext(true),
  violated: () => configuredSubagentContext(false),
  expectedFindings: [
    {
      message:
        "subagent 'reviewer' is desired, but its canonical content is missing from agent_extensions.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const desiredReviewer = {
  type: "skill",
  name: "reviewer",
  identity: "@acme/skills/reviewer",
  source: "@acme/skills/reviewer@^1.0.0",
  enabled: true,
  constraints: ["^1.0.0"],
  origins: [
    {
      type: "settings",
      source: "@acme/skills/reviewer@^1.0.0",
      enabled: true,
    },
  ],
} satisfies DesiredExtensionNode;

const skillLockContext = (accepted: boolean) =>
  contextFor({
    settings: validSettings({
      agents: ["claude-code"],
      skills: { reviewer: "@acme/skills/reviewer@^1.0.0" },
    }),
    lockfile: {
      _tag: "valid",
      contents: {
        lockfileVersion: 6,
        skills: accepted
          ? {
              reviewer: {
                type: "registry",
                sourceType: "registry",
                sourceName: "agentxm",
                endpoint: "https://registry.agentxm.ai",
                extensionType: "skill",
                workspaceName: "reviewer",
                packageFormat: "agentxm",
                owner: "@acme",
                name: "reviewer",
                resolvedVersion: "1.2.0",
                integrity: "sha512-stub",
                publisherBindingId: "hbnd_test",
                treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
              },
            }
          : {},
      },
    },
  }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          health: {
            desiredState: Effect.succeed({
              complete: true,
              nodes: [desiredReviewer],
              problems: [],
            }),
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const skillsLockfileAlignedConformance: WorkspaceRuleConformanceCase = {
  rule: skillsLockfileAlignedRule,
  satisfied: () => skillLockContext(true),
  violated: () => skillLockContext(false),
  expectedFindings: [
    {
      message: "Skill 'reviewer' has desired external content but no accepted resolution.",
      location: { file: "axm-lock.yaml" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const canonicalReviewer: ActualSkill = {
  key: { scope: "project", type: "skill", name: decodeExtensionNameSync("reviewer") },
  origin: { _tag: "canonical-axm-skill" },
  contentRoot: "/workspace/agent_extensions/agentxm/@acme/skills/reviewer/src",
  sourcePath: "/workspace/agent_extensions/agentxm/@acme/skills/reviewer/src/SKILL.md",
  packageRoot: "/workspace/agent_extensions/agentxm/@acme/skills/reviewer",
  hasSkillMd: true,
  hasSkillJson: true,
};

const skillIntegrityContext = (canonicalPresent: boolean) =>
  skillLockContext(true).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          workspace: {
            ...context.workspace,
            skills: {
              ...context.workspace.skills,
              actual: Effect.succeed(canonicalPresent ? [canonicalReviewer] : []),
            },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const skillsIntegrityValidConformance: WorkspaceRuleConformanceCase = {
  rule: skillsIntegrityValidRule,
  satisfied: () => skillIntegrityContext(true),
  violated: () => skillIntegrityContext(false),
  expectedFindings: [
    {
      message:
        "Skill 'reviewer' has an accepted resolution, but its installed source directory is missing.",
      location: { file: "axm-lock.yaml" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const installedReviewer = (projected: boolean): InstalledSkill => ({
  key: { scope: "project", type: "skill", name: decodeExtensionNameSync("reviewer") },
  installationOrigin: {
    _tag: "direct",
    declared: {
      name: decodeExtensionNameSync("reviewer"),
      entry: { source: "@acme/skills/reviewer@^1.0.0", enabled: true },
    },
  },
  activation: "enabled",
  resolved: Option.none(),
  actual: projected
    ? [
        {
          key: { scope: "project", type: "skill", name: decodeExtensionNameSync("reviewer") },
          origin: { _tag: "agent-skill-dir", agentId: "claude-code" },
          contentRoot: "/workspace/.claude/skills/reviewer",
          sourcePath: "/workspace/.claude/skills/reviewer/SKILL.md",
          packageRoot: null,
          hasSkillMd: true,
          hasSkillJson: false,
        },
      ]
    : [],
  providingPacks: [],
});

const skillArtifactsContext = (projected: boolean) =>
  contextFor({
    settings: validSettings({
      agents: ["claude-code"],
      skills: { reviewer: "@acme/skills/reviewer@^1.0.0" },
    }),
    lockfile: validLockfile,
  }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          workspace: {
            ...context.workspace,
            skills: {
              ...context.workspace.skills,
              installed: Effect.succeed([installedReviewer(projected)]),
            },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const skillsArtifactsCorrectConformance: WorkspaceRuleConformanceCase = {
  rule: skillsArtifactsCorrectRule,
  satisfied: () => skillArtifactsContext(true),
  violated: () => skillArtifactsContext(false),
  expectedFindings: [
    {
      message: "Skill 'reviewer' is enabled, but it is missing from declared agents: claude-code.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () =>
    contextFor({ settings: validSettings({ agents: [] }), lockfile: validLockfile }),
};

export const extensionConformanceCases: ReadonlyArray<WorkspaceRuleConformanceCase> = [
  configuredButNotInstalledConformance,
  skillsLockfileAlignedConformance,
  skillsIntegrityValidConformance,
  skillsArtifactsCorrectConformance,
];

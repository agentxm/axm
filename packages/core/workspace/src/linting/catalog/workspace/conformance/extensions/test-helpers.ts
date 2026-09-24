import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type {
  ActualSkill,
  CanonicalObservation,
  DesiredExtensionNode,
  InstalledSkill,
} from "../../../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { configuredButNotInstalledRule } from "../../configured-but-not-installed.js";
import { packsDependenciesResolvedRule } from "../../packs-dependencies-resolved.js";
import { packsSharedMembersDistributableRule } from "../../packs-shared-members-distributable.js";
import { skillsLockfileAlignedRule } from "../../skills-lockfile-aligned.js";
import { skillsIntegrityValidRule } from "../../skills-integrity-valid.js";
import { skillsArtifactsCorrectRule } from "../../skills-artifacts-correct.js";
import {
  contextFor,
  validLockfile,
  validSettings,
  type WorkspaceRuleConformanceCase,
} from "../test-helpers.js";

const desiredSubagent = {
  type: "subagent",
  name: "reviewer",
  identity: "@acme/subagents/reviewer",
  source: "@acme/subagents/reviewer",
  enabled: true,
  constraints: [],
  origins: [
    {
      type: "settings",
      localName: "reviewer",
      authority: "sourced",
      source: "@acme/subagents/reviewer",
      enabled: true,
    },
  ],
} satisfies DesiredExtensionNode;

/** The subagent's one canonical observation: usable when its content is present, else missing. */
const configuredSubagentContext = (canonicalPresent: boolean) =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          health: {
            desiredState: Effect.succeed({
              complete: true,
              nodes: [desiredSubagent],
              mcpSourceClosures: [],
              problems: [],
            }),
            canonicalObservations: Effect.succeed([
              {
                desired: desiredSubagent,
                observation: {
                  type: "subagent",
                  name: "reviewer",
                  status: canonicalPresent ? "usable" : "missing",
                  path: "/workspace/agent_extensions/registry/@acme/subagents/reviewer",
                },
              },
            ]),
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

/** The canonical observation of the reviewer Skill: usable when accepted, else unresolved. */
const reviewerObservation = (accepted: boolean): CanonicalObservation =>
  accepted
    ? {
        type: "skill",
        name: "reviewer",
        status: "usable",
        path: "/workspace/agent_extensions/registry/@acme/skills/reviewer",
      }
    : { type: "skill", name: "reviewer", status: "missing-resolution" };

const skillLockContext = (accepted: boolean) =>
  contextFor({
    settings: validSettings({
      agents: ["claude-code"],
      skills: { reviewer: "@acme/skills/reviewer@^1.0.0" },
    }),
    lockfile: {
      _tag: "valid",
      contents: {
        lockfileVersion: 8,
        skills: accepted
          ? {
              reviewer: {
                source: { type: "registry", url: "https://registry.agentxm.ai" },
                identity: { owner: "@acme", name: "reviewer" },
                resolved: {
                  version: "1.2.0",
                  integrity: "sha512-stub",
                  publisherBindingId: "hbnd_test",
                },
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
              mcpSourceClosures: [],
              problems: [],
            }),
            canonicalObservations: Effect.succeed([
              { desired: desiredReviewer, observation: reviewerObservation(accepted) },
            ]),
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
      message: "skill '@acme/skills/reviewer' has no accepted resolution.",
      location: { file: "axm-lock.yaml" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

const canonicalReviewer: ActualSkill = {
  key: { scope: "project", type: "skill", name: decodeExtensionNameSync("reviewer") },
  origin: { _tag: "canonical-axm-skill" },
  contentRoot: "/workspace/agent_extensions/registry/@acme/skills/reviewer/src",
  sourcePath: "/workspace/agent_extensions/registry/@acme/skills/reviewer/src/SKILL.md",
  packageRoot: "/workspace/agent_extensions/registry/@acme/skills/reviewer",
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

const packDeclaredReviewer = {
  type: "skill",
  name: "reviewer",
  identity: "@acme/skills/reviewer",
  source: "@acme/skills/reviewer@^1.0.0",
  enabled: true,
  constraints: ["^1.0.0"],
  origins: [
    {
      type: "pack",
      pack: "@acme/packs/quality",
      manifestPath: "agent_extensions/registry/@acme/packs/quality/pack.json",
      source: "@acme/skills/reviewer@^1.0.0",
      constraint: "^1.0.0",
      enabled: true,
    },
  ],
} satisfies DesiredExtensionNode;

const packDependencyContext = (accepted: boolean) =>
  skillLockContext(accepted).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          health: {
            desiredState: Effect.succeed({
              complete: true,
              nodes: [packDeclaredReviewer],
              mcpSourceClosures: [],
              problems: [],
            }),
            canonicalObservations: Effect.succeed([
              { desired: packDeclaredReviewer, observation: reviewerObservation(accepted) },
            ]),
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

const sharedPackDistributionContext = (distribute: boolean) =>
  contextFor({
    settings: validSettings({
      skills: { reviewer: { source: "workspace", distribute } },
      packs: { quality: "workspace" },
    }),
    lockfile: validLockfile,
  }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          health: {
            desiredState: Effect.succeed({
              complete: true,
              nodes: [packDeclaredReviewer],
              mcpSourceClosures: [],
              problems: [],
            }),
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const packsSharedMembersDistributableConformance: WorkspaceRuleConformanceCase = {
  rule: packsSharedMembersDistributableRule,
  satisfied: () => sharedPackDistributionContext(true),
  violated: () => sharedPackDistributionContext(false),
  expectedFindings: [
    {
      message: "Shared pack '@acme/packs/quality' names opted-out skill 'reviewer'.",
      location: { file: "agent_extensions/registry/@acme/packs/quality/pack.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

export const packsDependenciesResolvedConformance: WorkspaceRuleConformanceCase = {
  rule: packsDependenciesResolvedRule,
  satisfied: () => packDependencyContext(true),
  violated: () => packDependencyContext(false),
  expectedFindings: [
    {
      message: "Pack-declared skill '@acme/skills/reviewer' has no accepted resolution.",
      location: { file: "axm-lock.yaml" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
};

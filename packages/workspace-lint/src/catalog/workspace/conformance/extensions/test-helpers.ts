import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type { InstalledSubagent } from "@agentxm/workspace-state";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { configuredButNotInstalledRule } from "../../configured-but-not-installed.js";
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

export const extensionConformanceCases: ReadonlyArray<WorkspaceRuleConformanceCase> = [
  configuredButNotInstalledConformance,
];

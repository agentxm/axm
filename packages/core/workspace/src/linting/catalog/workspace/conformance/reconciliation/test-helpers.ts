import * as Effect from "effect/Effect";

import type {
  CanonicalObservation,
  DesiredExtensionNode,
} from "../../../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { desiredStateReconcilableRule } from "../../desired-state-reconcilable.js";
import { sourceEndpointsAlignedRule } from "../../source-endpoints-aligned.js";
import { contextFor, validSettings, type WorkspaceRuleConformanceCase } from "../test-helpers.js";

const treeIntegrity = `sha256-tree-v1:${"0".repeat(64)}`;

const sourceEndpointContext = (configuredEndpoint: string) =>
  contextFor({
    settings: validSettings({
      agents: ["claude-code"],
      sources: [{ name: "company", type: "registry", location: configuredEndpoint }],
      skills: {
        "react-router": "company:@remix-run/skills/react-router",
      },
    }),
    lockfile: {
      _tag: "valid",
      contents: {
        lockfileVersion: 8,
        skills: {
          "react-router": {
            source: {
              type: "registry",
              url: "https://registry.example.test",
            },
            identity: { owner: "@remix-run", name: "react-router" },
            resolved: {
              version: "1.0.0",
              integrity: "sha512-review",
              publisherBindingId: "hbnd_review",
            },
            treeIntegrity,
          },
        },
      },
    },
  });

export const sourceEndpointsAlignedConformance: WorkspaceRuleConformanceCase = {
  rule: sourceEndpointsAlignedRule,
  satisfied: () => sourceEndpointContext("https://registry.example.test"),
  violated: () => sourceEndpointContext("https://registry.changed.test"),
  expectedFindings: [
    {
      message:
        "Accepted resolution 'skill:react-router' binds source 'company' to registry https://registry.example.test/, but the configured source now resolves to registry https://registry.changed.test/. Use an explicit source transition before syncing.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: { _tag: "absent" } }),
};

const desiredSkill = {
  type: "skill",
  name: "installed-skill",
  identity: "@test/skills/installed-skill",
  source: "@test/skills/installed-skill@1.0.0",
  enabled: true,
  constraints: ["1.0.0"],
  origins: [],
} satisfies DesiredExtensionNode;

const desiredStateContext = (observation: CanonicalObservation) =>
  contextFor({ settings: validSettings(), lockfile: { _tag: "absent" } }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          health: {
            desiredState: Effect.succeed({
              complete: true,
              nodes: [desiredSkill],
              mcpSourceClosures: [],
              problems: [],
            }),
            canonicalObservations: Effect.succeed([{ desired: desiredSkill, observation }]),
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const desiredStateReconcilableConformance: WorkspaceRuleConformanceCase = {
  rule: desiredStateReconcilableRule,
  satisfied: () =>
    desiredStateContext({
      type: "skill",
      name: "installed-skill",
      status: "usable",
      path: "/workspace/skills/installed-skill",
    }),
  violated: () =>
    desiredStateContext({
      type: "skill",
      name: "installed-skill",
      status: "locally-modified",
      path: "/workspace/skills/installed-skill",
      contentIdentity: "sha256-working",
    }),
  expectedFindings: [
    {
      message: "skill '@test/skills/installed-skill' has canonical state locally-modified.",
      location: { file: "/workspace/skills/installed-skill" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: { _tag: "absent" } }),
};

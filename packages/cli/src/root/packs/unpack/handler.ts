import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import {
  buildInstallOperation,
  buildUninstallOperation,
  type UninstallRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import {
  parseRegistrySourcePatternParts,
  type ExtensionRef,
} from "@agentxm/client-core/unstable/extensions";
import { FilesManager } from "@agentxm/client-core/unstable/files";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import {
  previewOrApplyPlan,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { trustRecordKey } from "@agentxm/client-core/unstable/trust";
import {
  WorkspaceMutations,
  trustedCanonicalRef,
  type DesiredExtensionNode,
} from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../../json-output.js";

export interface UnpackHandlerArgs {
  readonly name: string;
  readonly strictAgentSync: Option.Option<boolean>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

type PackLeafRef = Exclude<ExtensionRef, { readonly type: "pack" }>;

interface Promotion {
  readonly node: DesiredExtensionNode;
  readonly ref: PackLeafRef;
}

const neverRetain: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};

const versionRangeFor = (node: DesiredExtensionNode): Option.Option<string> =>
  Option.fromUndefinedOr(parseRegistrySourcePatternParts(node.source)?.versionRange);

const normalizeIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

/**
 * Handles `axm packs unpack` by promoting every desired leaf from the named
 * pack to a direct settings origin, then removing the pack. Membership comes
 * from the complete desired graph and exact refs come from authoritative trust;
 * optional receipt history is never consulted.
 */
export const handleUnpack = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const skillManager = yield* SkillManager;
  const commandManager = yield* CommandManager;
  const mcpServerManager = yield* McpServerManager;
  const subagentManager = yield* SubagentManager;
  const filesManager = yield* FilesManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const knowledgeManager = yield* KnowledgeManager;
  const packManager = yield* PackManager;

  const graph = yield* ws.getDesiredStateGraph();
  if (!graph.complete) {
    return yield* makeAppError({
      code: "validation",
      detail: `Cannot unpack "${args.name}" while the desired pack graph is incomplete`,
      suggestions: graph.problems.map((problem) => ({
        description: `Resolve ${problem.type} before unpacking.`,
      })),
    });
  }

  const packNode = graph.nodes.find((node) => node.type === "pack" && node.name === args.name);
  if (packNode === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Pack "${args.name}" is not configured`,
      suggestions: [
        {
          description: "Install the pack first.",
          cmd: "axm packs install <source>",
        },
      ],
    });
  }

  const trust = yield* ws.getTrustState();
  const trustedRefFor = (node: DesiredExtensionNode) =>
    Effect.gen(function* () {
      const record = trust.records[trustRecordKey(node.type, node.name)];
      if (
        record === undefined ||
        normalizeIdentity(record.sourceIdentity) !== normalizeIdentity(node.identity)
      ) {
        return yield* makeAppError({
          code: "not_found",
          detail: `Trusted ${node.type} identity for "${node.name}" is unavailable`,
          suggestions: [
            {
              description: "Repair the pack before unpacking.",
              cmd: `axm packs install ${packNode.source} --force`,
            },
          ],
        });
      }
      return yield* trustedCanonicalRef({
        baseDir: ws.baseDir,
        scope: ws.scope,
        desired: node,
        trust: record,
      });
    });
  const packRef = yield* trustedRefFor(packNode);
  if (packRef.type !== "pack") {
    return yield* makeAppError({
      code: "not_found",
      detail: `Trusted pack identity for "${args.name}" is invalid`,
      suggestions: [
        {
          description: "Repair the pack before unpacking.",
          cmd: `axm packs install ${packNode.source} --force`,
        },
      ],
    });
  }

  const memberNodes = graph.nodes.filter(
    (node) =>
      node.type !== "pack" &&
      node.origins.some((origin) => origin.type === "pack" && origin.pack === packNode.identity),
  );
  const promotions = yield* Effect.forEach(
    memberNodes,
    (node) =>
      Effect.gen(function* () {
        const ref = yield* trustedRefFor(node);
        if (ref.type === "pack") {
          return yield* makeAppError({
            code: "not_found",
            detail: `Trusted ${node.type} identity for "${node.name}" is invalid`,
            suggestions: [
              {
                description: "Repair the pack before unpacking.",
                cmd: `axm packs install ${packNode.source} --force`,
              },
            ],
          });
        }
        return { node, ref } satisfies Promotion;
      }),
    { concurrency: "unbounded" },
  );

  const promotionSteps = promotions.map(({ node, ref }): PlannedJobStep => {
    const alreadyDirect = node.origins.some((origin) => origin.type === "settings");
    if (alreadyDirect) {
      return {
        readiness: "ready",
        label: node.name,
        run: Effect.succeed<JobStepResult>({
          result: "success",
          message: "already directly configured",
        }),
      };
    }

    const common = {
      versionRange: versionRangeFor(node),
      force: args.force,
      message: `Promoted ${node.type} ${node.name}`,
    };
    switch (ref.type) {
      case "skill":
        return buildInstallOperation(skillManager, { ...common, ref });
      case "command":
        return buildInstallOperation(commandManager, { ...common, ref });
      case "mcp-server":
        return buildInstallOperation(mcpServerManager, { ...common, ref });
      case "subagent":
        return buildInstallOperation(subagentManager, { ...common, ref });
      case "files":
        return buildInstallOperation(filesManager, { ...common, ref });
      case "rule":
        return buildInstallOperation(ruleManager, { ...common, ref });
      case "hook":
        return buildInstallOperation(hookManager, { ...common, ref });
      case "knowledge":
        return buildInstallOperation(knowledgeManager, { ...common, ref });
    }
  });

  const uninstallPackStep = buildUninstallOperation(packManager, neverRetain, {
    target: {
      type: "pack",
      owner: packRef.owner,
      name: packRef.pack.name,
    },
  });
  const plan = {
    _tag: "Plan",
    name: "Unpack pack",
    description: Option.some(`Unpack ${args.name} into direct settings entries`),
    jobs: [
      { steps: promotionSteps, concurrency: 1 as const },
      { steps: [uninstallPackStep], concurrency: 1 as const },
    ],
  } satisfies Plan;

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("packs.unpack", resolution);
});

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  buildUninstallOperation,
  type UninstallRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import {
  previewOrApplyPlan,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { trustRecordKey } from "@agentxm/client-core/unstable/trust";
import {
  WorkspaceMutations,
  trustedCanonicalRef,
  type DesiredExtensionNode,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { makePublicPositionalPlanExecutionMode } from "../../shared/confirmation-recovery.js";
import { buildAtomicPackGraphStep, validatePackGraphPostcondition } from "../graph-transition.js";

export interface UnpackHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

const neverRetain: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};

const normalizeIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const promoteToDirectSettings = (
  ws: WorkspaceMutationsService,
  node: DesiredExtensionNode,
): PlannedJobStep => {
  const entry = { source: node.source, enabled: node.enabled };
  const run = (() => {
    switch (node.type) {
      case "skill":
        return ws.setSkillEntry(node.name, entry);
      case "mcp-server":
        return ws.setMcpServerEntry(node.name, { ...entry, env: {} });
      case "subagent":
        return ws.setSubagentEntry(node.name, entry);
      case "rule":
        return ws.setRuleEntry(node.name, entry);
      case "hook":
        return ws.setHookEntry(node.name, entry);
      case "knowledge":
        return ws.setKnowledgeEntry(node.name, entry);
      case "pack":
        return Effect.fail(
          makeAppError({
            code: "validation",
            detail: `Nested pack member "${node.name}" cannot be unpacked`,
          }),
        );
    }
  })();
  return {
    readiness: "ready",
    label: node.name,
    run: run.pipe(
      Effect.as({
        result: "success",
        message: `Promoted ${node.type} ${node.name}`,
      } satisfies JobStepResult),
    ),
  };
};

/**
 * Handles `axm packs unpack` by promoting every desired leaf from the named
 * pack to a direct settings origin, then removing the pack. Membership comes
 * from the complete desired graph and exact refs come from authoritative trust;
 * optional receipt history is never consulted.
 */
export const handleUnpack = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const ws = yield* WorkspaceMutations;
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
              description:
                "Inspect and explicitly accept the authored pack baseline before unpacking.",
              cmd: `axm packs repair ${packNode.identity} --preview`,
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
          description: "Inspect and explicitly accept the authored pack baseline before unpacking.",
          cmd: `axm packs repair ${packNode.identity} --preview`,
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
                description:
                  "Inspect and explicitly accept the authored pack baseline before unpacking.",
                cmd: `axm packs repair ${packNode.identity} --preview`,
              },
            ],
          });
        }
        return node;
      }),
    { concurrency: "unbounded" },
  );

  const promotionSteps = promotions.map((node): PlannedJobStep => {
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

    return promoteToDirectSettings(ws, node);
  });

  const uninstallPackStep = buildUninstallOperation(packManager, neverRetain, {
    target: {
      type: "pack",
      owner: packRef.owner,
      name: packRef.pack.name,
    },
  });
  const artifactTargets: ReadonlyArray<JobStepArtifactTarget> = [
    ...promotions.map((node): JobStepArtifactTarget => ({
      path: `.axm/settings.json#${node.type}.${node.name}`,
      change: "updated",
    })),
    {
      path: `.axm/extensions/${normalizeIdentity(packNode.identity)}`,
      change: "removed",
    } satisfies JobStepArtifactTarget,
  ];
  const graphStep = yield* buildAtomicPackGraphStep({
    label: packNode.identity,
    message: `Unpacked ${packNode.identity} into ${promotions.length} direct declaration${promotions.length === 1 ? "" : "s"}`,
    artifact: {
      path: "pack provenance",
      scope: ws.scope,
      change: "updated",
      fileCount: promotions.length + 1,
      targets: artifactTargets,
    },
    steps: [...promotionSteps, uninstallPackStep],
    validate: validatePackGraphPostcondition({
      requiredMembers: promotions.flatMap((node) =>
        node.type === "pack"
          ? []
          : [
              {
                type: node.type,
                name: node.name,
                direct: true,
                enabled: node.enabled,
              },
            ],
      ),
      absent: [{ type: "pack", name: packNode.name }],
    }),
  }).pipe(Effect.provideService(WorkspaceMutations, ws));
  const plan = {
    _tag: "Plan",
    name: "Unpack pack",
    description: Option.some(`Unpack ${args.name} into direct settings entries`),
    jobs: [{ steps: [graphStep], concurrency: 1 as const }],
    sections: [
      {
        title: "Direct declarations created",
        items: promotions.map((node) => `${node.type}: ${node.name}`),
      },
      {
        title: "Pack source removed",
        items: [`.axm/extensions/${normalizeIdentity(packNode.identity)}`],
      },
    ],
  } satisfies Plan;

  const execution = yield* makePublicPositionalPlanExecutionMode(
    args,
    ["packs", "unpack"],
    [args.name],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitPlanResolutionResult("packs.unpack", resolution);
});

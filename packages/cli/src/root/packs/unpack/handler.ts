import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  buildUninstallOperation,
  type UninstallRetentionPolicy,
} from "@agentxm/extension-management/unstable/extensions";
import { PackManager } from "@agentxm/extension-management/unstable/packs";
import {
  operationPresentation,
  previewOrApplyPlan,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  WorkspaceMutations,
  usableAcceptedCanonical,
  type DesiredExtensionNode,
  type WorkspaceMutationsService,
} from "@agentxm/extension-management/unstable/workspace";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../../shared/confirmation-recovery.js";
import {
  workspaceCanonicalNodePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";
import { buildAtomicPackGraphStep, validatePackGraphPostcondition } from "../graph-transition.js";
import { appErrorToStepFailure } from "@agentxm/extension-management/unstable/app-error/conversions";

export interface UnpackHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

const neverRetain: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};

const promoteToDirectSettings = (
  ws: WorkspaceMutationsService,
  node: DesiredExtensionNode & { readonly source: string },
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
      Effect.mapError(appErrorToStepFailure),
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
 * from the complete desired graph and exact refs come from authored intent or
 * accepted external resolutions.
 */
export const handleUnpack = (args: UnpackHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "packs.unpack",
      mode: args.preview ? "preview" : "apply",
      planName: "Unpack pack",
    },
    handleUnpackBody(args),
  );

const handleUnpackBody = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const packManager = yield* PackManager;
  const path = yield* Path.Path;

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

  const acceptedRefFor = (node: DesiredExtensionNode) =>
    Effect.gen(function* () {
      const canonical = yield* usableAcceptedCanonical({
        workspace: ws,
        type: node.type,
        name: node.name,
      });
      if (Option.isNone(canonical)) {
        return yield* makeAppError({
          code: "not_found",
          detail: `Accepted ${node.type} identity for "${node.name}" is unavailable`,
          suggestions: [
            {
              description: "Preview workspace reconciliation before unpacking.",
              cmd: `axm sync ${packNode.identity} --preview`,
            },
          ],
        });
      }
      return canonical.value.ref;
    });
  const packRef = yield* acceptedRefFor(packNode);
  if (packRef.type !== "pack") {
    return yield* makeAppError({
      code: "not_found",
      detail: `Accepted pack identity for "${args.name}" is invalid`,
      suggestions: [
        {
          description: "Preview workspace reconciliation before unpacking.",
          cmd: `axm sync ${packNode.identity} --preview`,
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
        const ref = yield* acceptedRefFor(node);
        if (ref.type === "pack") {
          return yield* makeAppError({
            code: "not_found",
            detail: `Accepted ${node.type} identity for "${node.name}" is invalid`,
            suggestions: [
              {
                description: "Preview workspace reconciliation before unpacking.",
                cmd: `axm sync ${packNode.identity} --preview`,
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

    if (node.source === undefined) {
      return {
        readiness: "error",
        errorMessage: "Inline MCP configuration has no Pack source.",
        label: node.name,
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
      path: `${workspaceSettingsPath(ws.scope)}#${node.type}.${node.name}`,
      change: "updated",
    })),
    {
      path: workspaceCanonicalNodePath(path, ws, packNode),
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
    children: [...promotionSteps, uninstallPackStep].map((step) => ({
      step,
      coverage: "ineligible",
    })),
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
    presentation: operationPresentation(
      { imperative: "unpack", past: "Unpacked", gerund: "Unpacking" },
      "pack",
    ),
    jobs: [{ steps: [graphStep], concurrency: 1 as const }],
  } satisfies Plan;

  const execution = yield* makePublicPositionalPlanExecution(
    args,
    ["packs", "unpack"],
    [args.name],
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("packs.unpack", resolution);
});

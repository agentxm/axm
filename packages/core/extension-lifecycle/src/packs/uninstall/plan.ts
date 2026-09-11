/**
 * Uninstalling packs.
 *
 * Removing a pack removes every member no other origin still declares, in one
 * transition: members first, while their pack-derived desired state is still
 * observable, then the pack itself. A selected pack whose own manifest cannot
 * be read is retired — its registration goes, its unverifiable content stays —
 * and a graph incomplete for any other reason blocks instead.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  buildUninstallOperation,
  toLabel,
} from "@agentxm/extension-materialization";
import {
  parseExtensionFqnParts,
  type ExtensionFqnParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import {
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  decodeDesiredExtensionIdentity,
  type DesiredPackageAuthority,
  type DesiredStateGraph,
  type ExtensionTarget,
  type PackExtensionTarget,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { expandGlob } from "../../glob.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { buildAggregateProjectionStep } from "../../install/aggregate-projection-step.js";
import { installRefused, type InstallStepRequirements } from "../../install/vocabulary.js";
import {
  exclusiveMemberRetentionPolicy,
  makeWorkspaceRetentionPolicy,
} from "../../uninstall/retention-policy.js";
import { workspaceCanonicalNodePath } from "../../workspace-paths.js";
import { buildAtomicPackGraphStep, validatePackGraphPostcondition } from "../graph-transition.js";
import {
  PACK_UNINSTALL_GRAPH_BLOCKER_ID,
  planPackUninstallGraphReadiness,
  type PackRetirement,
} from "./readiness.js";

/** How the request named the pack to remove. */
export type PackUninstallSelector =
  | { readonly _tag: "ExactFqn"; readonly identity: ExtensionFqnParts & { readonly type: "pack" } }
  | { readonly _tag: "SimpleName"; readonly name: string };

/** One pack the removal resolved, with the desired identity it was resolved from. */
export interface ResolvedPackUninstallTarget extends PackExtensionTarget {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly authority: DesiredPackageAuthority;
  readonly desiredIdentity: string;
}

/** The packs this removal withdraws. */
export interface PackUninstallIntent {
  readonly packsToUninstall: ReadonlyArray<ResolvedPackUninstallTarget>;
}

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const identityValidationError = (identity: string) =>
  installRefused({
    category: "validation",
    detail: `Configured pack identity ${identity} is invalid`,
  });

const readDesiredGraph = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  return yield* ws
    .getDesiredStateGraph()
    .pipe(
      Effect.mapError((cause) =>
        installRefused({ category: "internal", detail: "Desired state could not be read", cause }),
      ),
    );
});

/**
 * The pack this candidate was resolved from must still be the pack in the
 * graph when the transition applies; otherwise the candidate describes a
 * decision that is no longer available.
 */
export const validateResolvedPackUninstallTargets = (
  graph: DesiredStateGraph,
  targets: ReadonlyArray<ResolvedPackUninstallTarget>,
): Effect.Effect<void, ExtensionLifecycleFailed> =>
  Effect.gen(function* () {
    for (const expected of targets) {
      const current = graph.nodes.find(
        (candidate) => candidate.type === "pack" && candidate.name === expected.name,
      );
      if (current === undefined) {
        return yield* installRefused({
          category: "conflict",
          detail: `Pack ${expected.desiredIdentity} changed or was removed before uninstall`,
          recover: "Inspect the current pack state, then retry the uninstall.",
          cmd: `axm packs show ${expected.name}`,
        });
      }

      const decoded = decodeDesiredExtensionIdentity(current.identity);
      if (decoded === undefined || decoded.type !== "pack") {
        return yield* identityValidationError(current.identity);
      }

      if (
        current.identity !== expected.desiredIdentity ||
        decoded.authority !== expected.authority ||
        decoded.owner !== expected.owner ||
        decoded.name !== expected.name
      ) {
        return yield* installRefused({
          category: "conflict",
          detail: `Pack ${expected.desiredIdentity} changed or was removed before uninstall`,
          recover: "Inspect the current pack state, then retry the uninstall.",
          cmd: `axm packs show ${expected.name}`,
        });
      }
    }
  });

const retirementKey = (retirement: PackRetirement): string =>
  `${retirement.pack}\u0000${retirement.reason}\u0000${retirement.manifestPath}`;

const retirementSetKey = (retirements: ReadonlyArray<PackRetirement>): string =>
  [...retirements].map(retirementKey).sort().join("\u0001");

/**
 * Preview and apply must reach one decision from unchanged inputs. A target
 * whose package became readable — or unreadable — between the two phases is a
 * different decision, so the candidate is stale rather than applicable.
 */
export const validatePackRetirementFacts = (args: {
  readonly planned: ReadonlyArray<PackRetirement>;
  readonly observed: ReadonlyArray<PackRetirement> | undefined;
}): Effect.Effect<void, ExtensionLifecycleFailed> => {
  if (
    args.observed !== undefined &&
    retirementSetKey(args.observed) === retirementSetKey(args.planned)
  ) {
    return Effect.void;
  }
  const packs = [...new Set([...args.planned].map((retirement) => retirement.pack))];
  return Effect.fail(
    installRefused({
      category: "conflict",
      detail:
        packs.length === 0
          ? "The pack graph changed before uninstall"
          : `Pack package readability for ${packs.join(", ")} changed before uninstall`,
      recover: "Inspect the current pack state, then retry the uninstall.",
      cmd: "axm packs list",
    }),
  );
};

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "pack",
);

/** Read the pack selector: an exact FQN, one name, or a glob over pack names. */
export const parsePackUninstallSelectors: (
  selector: string,
) => Effect.Effect<
  ReadonlyArray<PackUninstallSelector>,
  ExtensionLifecycleFailed,
  InstallStepRequirements
> = Effect.fn("UninstallExtensions.parsePackSelectors")(function* (selector: string) {
  const requested = parseExtensionFqnParts(selector);
  if (requested !== undefined && requested.type !== "pack") {
    return yield* installRefused({
      category: "validation",
      detail: `Expected a pack identity, received ${selector}`,
    });
  }
  if (requested !== undefined) {
    return [
      {
        _tag: "ExactFqn" as const,
        identity: { owner: requested.owner, type: "pack" as const, name: requested.name },
      },
    ];
  }
  if (!selector.includes("*")) return [{ _tag: "SimpleName" as const, name: selector }];

  const graph = yield* readDesiredGraph;
  const names = expandGlob(
    selector,
    graph.nodes.filter((node) => node.type === "pack").map((node) => node.name),
  );
  return names.map((name) => ({ _tag: "SimpleName" as const, name }));
});

/** Resolve the selectors against the desired graph. */
export const finalizePackUninstallIntent: (
  selectors: ReadonlyArray<PackUninstallSelector>,
) => Effect.Effect<PackUninstallIntent, ExtensionLifecycleFailed, InstallStepRequirements> =
  Effect.fn("UninstallExtensions.finalizePackIntent")(function* (
    selectors: ReadonlyArray<PackUninstallSelector>,
  ) {
    const graph = yield* readDesiredGraph;
    const targets = new Map<string, ResolvedPackUninstallTarget>();
    for (const selector of selectors) {
      const name = selector._tag === "ExactFqn" ? selector.identity.name : selector.name;
      const candidates = graph.nodes.filter(
        (candidate) => candidate.type === "pack" && candidate.name === name,
      );
      for (const node of candidates) {
        const identity = decodeDesiredExtensionIdentity(node.identity);
        if (identity === undefined || identity.type !== "pack") {
          return yield* identityValidationError(node.identity);
        }
        if (selector._tag === "ExactFqn" && identity.owner !== selector.identity.owner) continue;
        targets.set(node.identity, {
          type: "pack",
          name: identity.name,
          owner: identity.owner,
          authority: identity.authority,
          desiredIdentity: node.identity,
        });
      }
    }
    return { packsToUninstall: [...targets.values()] };
  });

/** Everything the pack removal reads and writes through. */
export type PackUninstallRequirements =
  | InstallStepRequirements
  | Path.Path
  | FileSystem.FileSystem
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | PackManager
  | RuleManager
  | SkillManager
  | SubagentManager;

/** The single atomic closure a settled pack removal becomes. */
export const planPackUninstall: (
  intent: PackUninstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  PackUninstallRequirements
> = Effect.fn("UninstallExtensions.planPacks")(function* (intent: PackUninstallIntent) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const packManager = yield* PackManager;
  const skillManager = yield* SkillManager;
  const subagentManager = yield* SubagentManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const knowledgeManager = yield* KnowledgeManager;
  const mcpServerManager = yield* McpServerManager;

  const observedGraph = yield* readDesiredGraph;
  const graphReadiness = planPackUninstallGraphReadiness(
    observedGraph,
    intent.packsToUninstall.map((pack) => pack.desiredIdentity),
    ws.scope,
  );
  if (graphReadiness.readiness === "blocked") {
    return {
      _tag: "Plan",
      name: "Uninstall packs",
      description: Option.some("Pack graph readiness prevents this uninstall."),
      presentation: uninstallPresentation,
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "error",
              label:
                intent.packsToUninstall.map((pack) => pack.desiredIdentity).join(", ") ||
                "Pack graph",
              errorMessage: graphReadiness.detail,
              blockingConditionIds: [PACK_UNINSTALL_GRAPH_BLOCKER_ID],
              artifact: {
                path: "pack graph",
                scope: ws.scope,
                change: "unchanged",
                fileCount: 0,
                targets: graphReadiness.facts.flatMap((fact) =>
                  fact.authoritativeLocations.map((location) => ({
                    path: location,
                    change: "unchanged" as const,
                  })),
                ),
              },
            },
          ],
        },
      ],
      riskConditions: [
        {
          level: "blocked",
          id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
          detail: graphReadiness.detail,
          errorCode: "conflict",
        },
      ],
    } satisfies Plan<InstallStepRequirements>;
  }

  if (intent.packsToUninstall.length === 0) {
    return {
      _tag: "Plan",
      name: "Uninstall packs",
      description: Option.none(),
      presentation: uninstallPresentation,
      jobs: [{ concurrency: 1, steps: [] }],
    } satisfies Plan<InstallStepRequirements>;
  }

  const graph = graphReadiness.graph;
  const plannedRetirements = graphReadiness.retirements;
  const retirementByIdentity = new Map(
    plannedRetirements.map((retirement) => [retirement.pack, retirement]),
  );
  // Only a selected pack can be retired, and members are never read from an
  // unreadable manifest, so the lookup is keyed by the selected pack's name.
  const retirementByPackName = new Map<string, PackRetirement>(
    intent.packsToUninstall.flatMap((pack) => {
      const retirement = retirementByIdentity.get(normalizedPackIdentity(pack.desiredIdentity));
      return retirement === undefined ? [] : [[pack.name, retirement] as const];
    }),
  );

  const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

  const allTargets = new Map<string, ExtensionTarget>();
  for (const pack of intent.packsToUninstall) {
    allTargets.set(`pack:${pack.name}`, pack);
  }
  const removingPackIdentities = new Set(
    intent.packsToUninstall.map((pack) => pack.desiredIdentity),
  );
  for (const node of graph.nodes) {
    if (node.type === "pack") continue;
    const removedOrigin = node.origins.some(
      (origin) => origin.type === "pack" && removingPackIdentities.has(origin.pack),
    );
    if (!removedOrigin) continue;
    const retainedOrigin = node.origins.some(
      (origin) =>
        origin.type === "settings" ||
        (origin.type === "pack" && !removingPackIdentities.has(origin.pack)),
    );
    if (retainedOrigin) continue;
    allTargets.set(`${node.type}:${node.name}`, { type: node.type, name: node.name });
  }

  // Remove members while their pack-derived desired state is still
  // observable, then retire the owning pack.
  const packTargets = [...allTargets.values()].filter((target) => target.type === "pack");
  const depTargets = [...allTargets.values()].filter((target) => target.type !== "pack");
  const orderedTargets = [...depTargets, ...packTargets];
  const sourcePathByTarget = new Map(
    graph.nodes.map((node) => [
      `${node.type}:${node.name}`,
      workspaceCanonicalNodePath(path, ws, node),
    ]),
  );

  const steps = orderedTargets.map((target): PlannedJobStep<InstallStepRequirements> => {
    switch (target.type) {
      case "pack": {
        const retirement = retirementByPackName.get(target.name);
        return buildUninstallOperation(packManager, retentionPolicy, {
          target,
          toStepFailure: lifecycleStepFailure,
          ...(retirement === undefined
            ? {}
            : {
                retirement: {
                  // Results name workspace-relative paths, so the same
                  // retirement reads identically from any workspace.
                  manifestPath: path.relative(ws.baseDir, retirement.manifestPath),
                  reason: retirement.reason,
                },
              }),
        });
      }
      case "skill":
        return buildUninstallOperation(skillManager, exclusiveMemberRetentionPolicy, {
          toStepFailure: lifecycleStepFailure,
          target,
        });
      case "mcp-server":
        return buildUninstallOperation(mcpServerManager, exclusiveMemberRetentionPolicy, {
          toStepFailure: lifecycleStepFailure,
          target,
        });
      case "subagent":
        return buildUninstallOperation(subagentManager, exclusiveMemberRetentionPolicy, {
          toStepFailure: lifecycleStepFailure,
          target,
        });
      case "rule":
        return buildUninstallOperation(ruleManager, exclusiveMemberRetentionPolicy, {
          toStepFailure: lifecycleStepFailure,
          target,
          skipProjections: true,
        });
      case "hook":
        return buildUninstallOperation(hookManager, exclusiveMemberRetentionPolicy, {
          toStepFailure: lifecycleStepFailure,
          target,
          skipProjections: true,
        });
      case "knowledge":
        return buildUninstallOperation(knowledgeManager, exclusiveMemberRetentionPolicy, {
          toStepFailure: lifecycleStepFailure,
          target,
          skipProjections: true,
        });
    }
  });

  const projectionStep = yield* buildAggregateProjectionStep({
    types: new Set(orderedTargets.map((target) => target.type)),
  });
  const registrationOnly =
    plannedRetirements.length === 0
      ? ""
      : ` (${plannedRetirements.length} pack${plannedRetirements.length === 1 ? "" : "s"} unregistered without removing package content)`;
  const graphStep = yield* buildAtomicPackGraphStep({
    label: `${intent.packsToUninstall.length} pack${intent.packsToUninstall.length === 1 ? "" : "s"}`,
    message: `Uninstalled ${intent.packsToUninstall.length} pack${intent.packsToUninstall.length === 1 ? "" : "s"} and ${depTargets.length} exclusive member${depTargets.length === 1 ? "" : "s"}${registrationOnly}`,
    artifact: {
      path: "pack graph",
      scope: ws.scope,
      change: "removed",
      fileCount: orderedTargets.length,
      targets: orderedTargets.map((target) => ({
        path: sourcePathByTarget.get(`${target.type}:${target.name}`) ?? toLabel(target),
        // Content AXM could not verify is preserved, so its canonical path is
        // never reported as removed.
        change:
          target.type === "pack" && retirementByPackName.has(target.name) ? "unchanged" : "removed",
      })),
    },
    children: [
      ...steps.map((step) => ({ step, coverage: "ineligible" as const })),
      ...Option.toArray(projectionStep).map((step) => ({
        step,
        coverage: "ineligible" as const,
      })),
    ],
    preTransition: Effect.gen(function* () {
      const currentGraph = yield* readDesiredGraph;
      yield* validateResolvedPackUninstallTargets(currentGraph, intent.packsToUninstall);
      const currentReadiness = planPackUninstallGraphReadiness(
        currentGraph,
        intent.packsToUninstall.map((pack) => pack.desiredIdentity),
        ws.scope,
      );
      yield* validatePackRetirementFacts({
        planned: plannedRetirements,
        observed: currentReadiness.readiness === "ready" ? currentReadiness.retirements : undefined,
      });
    }),
    validate: validatePackGraphPostcondition({ absent: orderedTargets }),
  });

  return {
    _tag: "Plan",
    name:
      intent.packsToUninstall.length === 1
        ? "Uninstall pack"
        : `Uninstall ${intent.packsToUninstall.length} packs`,
    description: Option.none(),
    presentation: uninstallPresentation,
    jobs: [{ concurrency: 1, steps: [graphStep] }],
  } satisfies Plan<InstallStepRequirements>;
});

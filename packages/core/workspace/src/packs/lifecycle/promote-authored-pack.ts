import { buildReconciliationClosure } from "../../reconciliation/index.js";
/**
 * Unpacking a Pack: promoting its members to direct declarations.
 *
 * A Pack owns the declarations of everything it brings in. Unpacking hands
 * that ownership to the workspace: every member the Pack contributed becomes
 * a direct settings declaration carrying the member's own accepted source and
 * activation, and the Pack declaration itself goes away. Nothing is
 * re-resolved and nothing is re-acquired — the accepted resolutions the Pack
 * already established are exactly what the direct declarations inherit.
 *
 * Membership has to be provable before any of it happens: an incomplete Pack
 * graph, a Pack that is not configured, or a member whose accepted identity
 * cannot be read stops the operation rather than leaving the workspace half
 * promoted. The promotion and the Pack's removal are one atomic graph
 * transition validated against the desired state it must leave behind.
 *
 * A member that is already declared directly keeps the declaration it has:
 * unpacking grants ownership, it does not overwrite intent a person expressed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  DesiredStateReader,
  SettingsWriter,
  WorkspaceLocation,
  type SettingsWriterService,
  type WorkspaceLayout,
  type WorkspaceLocationService,
} from "../../desired-state/index.js";

import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { PackManager } from "../../materialization/index.js";
import {
  buildUninstallOperation,
  type UninstallRetentionPolicy,
} from "../../reconciliation/index.js";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ExecutionCandidate,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "../../transitions/planning/index.js";
import { usableAcceptedCanonical, type DesiredExtensionNode } from "../../desired-state/index.js";

import { ExtensionLifecycleFailed } from "../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../lifecycle/step-failure.js";
import type { InstallStepRequirements } from "../../lifecycle/install/vocabulary.js";
import { validatePackGraphPostcondition } from "./graph-transition.js";

// -----------------------------------------------------------------------------
// Request and candidate
// -----------------------------------------------------------------------------

/** Which configured Pack is being unpacked. */
export interface PromoteAuthoredPackRequest {
  /** The configured Pack's installed name. */
  readonly name: string;
}

/** What every step in this transition may require when it runs. */
export type PromoteAuthoredPackRequirements = InstallStepRequirements;

/** One member the transition promotes, and how it was declared before. */
export interface PromotedPackMember {
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
  /** True when the workspace already declared this member directly. */
  readonly alreadyDirect: boolean;
}

/**
 * A settled unpack: membership is proven, every member's accepted identity is
 * readable, and nothing is written.
 */
export interface PromoteAuthoredPackCandidate {
  /** The Pack's desired-state identity, as the transition reports it. */
  readonly packIdentity: string;
  readonly packName: string;
  readonly members: ReadonlyArray<PromotedPackMember>;
  readonly execution: ExecutionCandidate<PromoteAuthoredPackRequirements>;
}

/**
 * Every failure settling an unpack can surface before anything is written:
 * the feature's own refusals plus whatever reading the desired graph, the
 * accepted identities, and the transition it composes surfaced.
 */
export type PromoteAuthoredPackFailure = Effect.Error<ReturnType<typeof settleUnpack>>;

/** Everything settling an unpack reads before it freezes a candidate. */
export type PreparePromoteAuthoredPackRequirements = Effect.Services<
  ReturnType<typeof settleUnpack>
>;

// -----------------------------------------------------------------------------
// Promotion
// -----------------------------------------------------------------------------

/**
 * The Pack is leaving, so nothing it owned is retained on its account. The
 * members it contributed are retained by their own direct declarations, which
 * this same transition writes.
 */
const neverRetain: UninstallRetentionPolicy = {
  isRequiredByInstalledPack: () => Effect.succeed(false),
};

const reconcileSuggestion = (packIdentity: string) => ({
  description: "Preview workspace reconciliation before unpacking.",
  cmd: `axm sync ${packIdentity} --preview`,
});

/**
 * Write the member's own declaration: the source and activation it already
 * has under the Pack become the direct declaration it keeps without it.
 *
 * Unpacking deliberately creates acquisition intent, but the member may
 * already carry a configuration-only entry. Those preferences describe the
 * member, not the route that supplied it, so the ones the new declaration can
 * express cross over rather than being dropped on the way.
 */
const promoteToDirectSettings = (
  settingsWriter: SettingsWriterService,
  node: DesiredExtensionNode & { readonly source: string },
): PlannedJobStep<PromoteAuthoredPackRequirements> => {
  const entry = { source: node.source, enabled: node.enabled };
  const run = (() => {
    switch (node.type) {
      case "skill":
        return settingsWriter.setEntry("skill", node.name, entry);
      case "mcp-server":
        return settingsWriter.setEntry("mcp-server", node.name, {
          ...entry,
          env: node.preference?.env ?? {},
        });
      case "subagent":
        return settingsWriter.setEntry("subagent", node.name, entry);
      case "rule":
        return settingsWriter.setEntry("rule", node.name, entry);
      case "hook":
        return settingsWriter.setEntry("hook", node.name, entry);
      case "knowledge":
        return settingsWriter.setEntry("knowledge", node.name, {
          ...entry,
          ...(node.preference?.instructionEntry === undefined
            ? {}
            : { instructionEntry: node.preference.instructionEntry }),
        });
      case "pack":
        return Effect.fail(
          new ExtensionLifecycleFailed({
            category: "validation",
            detail: `Nested pack member "${node.name}" cannot be unpacked`,
          }),
        );
    }
  })();
  return {
    readiness: "ready",
    label: node.name,
    run: run.pipe(
      Effect.mapError(lifecycleStepFailure),
      Effect.as({
        result: "success",
        message: `Promoted ${node.type} ${node.name}`,
      } satisfies JobStepResult),
    ),
  };
};

/** The workspace-relative settings file the promoted declarations land in. */
const settingsDisplayPath = (path: Path.Path, location: WorkspaceLocationService): string =>
  path.relative(location.baseDir, location.settingsPath);

/** The workspace-relative canonical location the removed Pack occupied. */
const packDisplayPath = (
  path: Path.Path,
  location: WorkspaceLocationService,
  layout: WorkspaceLayout,
  node: { readonly name: string; readonly identity: string },
): string =>
  node.identity.startsWith("workspace:") && layout.scope === "project"
    ? path.join(path.relative(location.baseDir, layout.authoredRoot("pack")), node.name)
    : path.join(
        path.relative(location.baseDir, layout.acquiredRoot),
        node.identity.startsWith("workspace:")
          ? node.identity.slice("workspace:".length)
          : node.identity,
      );

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/**
 * Settle an unpack: prove the graph is complete and the Pack is configured,
 * read every member's accepted identity, and freeze the atomic transition
 * that promotes the members and removes the Pack.
 */
const settleUnpack = Effect.fn("PromoteAuthoredPack.prepare")(function* (
  request: PromoteAuthoredPackRequest,
) {
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const desiredState = yield* DesiredStateReader;
  const settingsWriter = yield* SettingsWriter;
  const packManager = yield* PackManager;
  const path = yield* Path.Path;

  const graph = yield* desiredState.graph();
  if (!graph.complete) {
    return yield* new ExtensionLifecycleFailed({
      category: "validation",
      detail: `Cannot unpack "${request.name}" because some pack manifests are missing or invalid`,
      suggestions: graph.problems.map((problem) => ({
        description: `Resolve ${problem.type} before unpacking.`,
      })),
    });
  }

  const packNode = graph.nodes.find((node) => node.type === "pack" && node.name === request.name);
  if (packNode === undefined || packNode.type !== "pack") {
    return yield* new ExtensionLifecycleFailed({
      category: "not_found",
      detail: `Pack "${request.name}" is not configured`,
      suggestions: [{ description: "Install the pack first.", cmd: "axm packs install <source>" }],
    });
  }

  const acceptedRefFor = Effect.fn("PromoteAuthoredPack.acceptedRef")(function* (
    node: DesiredExtensionNode,
  ) {
    const canonical = yield* usableAcceptedCanonical({
      type: node.type,
      name: node.name,
    });
    if (Option.isNone(canonical)) {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `Accepted ${node.type} identity for "${node.name}" is unavailable`,
        suggestions: [reconcileSuggestion(packNode.identity)],
      });
    }
    return canonical.value.ref;
  });

  const packRef = yield* acceptedRefFor(packNode);
  if (packRef.type !== "pack") {
    return yield* new ExtensionLifecycleFailed({
      category: "not_found",
      detail: `Accepted pack identity for "${request.name}" is invalid`,
      suggestions: [reconcileSuggestion(packNode.identity)],
    });
  }

  const memberNodes = graph.nodes.filter(
    (node) =>
      node.type !== "pack" &&
      node.origins.some((origin) => origin.type === "pack" && origin.pack === packNode.identity),
  );
  const promotions = yield* Effect.forEach(
    memberNodes,
    Effect.fn("PromoteAuthoredPack.member")(function* (node) {
      const ref = yield* acceptedRefFor(node);
      if (ref.type === "pack") {
        return yield* new ExtensionLifecycleFailed({
          category: "not_found",
          detail: `Accepted ${node.type} identity for "${node.name}" is invalid`,
          suggestions: [reconcileSuggestion(packNode.identity)],
        });
      }
      return node;
    }),
    { concurrency: 16 },
  );

  const promotionSteps = promotions.map((node): PlannedJobStep<PromoteAuthoredPackRequirements> => {
    // A declaration a person already wrote outranks the promotion: the
    // member is theirs to own, on the terms they chose.
    if (node.origins.some((origin) => origin.type === "settings")) {
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
    return promoteToDirectSettings(settingsWriter, node);
  });

  const uninstallPackStep = buildUninstallOperation(packManager, neverRetain, {
    toStepFailure: lifecycleStepFailure,
    target: { type: "pack", owner: packRef.owner, name: packRef.pack.name },
  });

  const artifactTargets: ReadonlyArray<JobStepArtifactTarget> = [
    ...promotions.map((node): JobStepArtifactTarget => ({
      path: `${settingsDisplayPath(path, location)}#${node.type}.${node.name}`,
      change: "updated",
    })),
    { path: packDisplayPath(path, location, layout, packNode), change: "removed" },
  ];

  const graphStep = yield* buildReconciliationClosure({
    toStepFailure: lifecycleStepFailure,
    label: packNode.identity,
    message: `Unpacked ${packNode.identity} into ${promotions.length} direct declaration${
      promotions.length === 1 ? "" : "s"
    }`,
    artifact: {
      path: "pack provenance",
      scope: location.scope,
      change: "updated",
      fileCount: promotions.length + 1,
      targets: artifactTargets,
    },
    children: [...promotionSteps, uninstallPackStep].map((step) => ({
      step,
      coverage: "ineligible" as const,
    })),
    validate: validatePackGraphPostcondition({
      requiredMembers: promotions.flatMap((node) =>
        node.type === "pack"
          ? []
          : [{ type: node.type, name: node.name, direct: true, enabled: node.enabled }],
      ),
      absent: [{ type: "pack", name: packNode.name }],
    }),
  });

  const plan: Plan<PromoteAuthoredPackRequirements> = {
    _tag: "Plan",
    name: "Unpack pack",
    description: Option.some(`Unpack ${request.name} into direct settings entries`),
    presentation: operationPresentation(
      { imperative: "unpack", past: "Unpacked", gerund: "Unpacking" },
      "pack",
    ),
    jobs: [{ concurrency: 1, steps: [graphStep] }],
  };

  return {
    packIdentity: packNode.identity,
    packName: packNode.name,
    members: promotions.map((node) => ({
      type: node.type,
      name: node.name,
      alreadyDirect: node.origins.some((origin) => origin.type === "settings"),
    })),
    execution: yield* prepareExecutionCandidate(plan),
  } satisfies PromoteAuthoredPackCandidate;
});

export const preparePromoteAuthoredPack: (
  request: PromoteAuthoredPackRequest,
) => Effect.Effect<
  PromoteAuthoredPackCandidate,
  PromoteAuthoredPackFailure,
  PreparePromoteAuthoredPackRequirements
> = settleUnpack;

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled unpack, resolving to one operation outcome. */
export const previewOrApplyPromoteAuthoredPack = (
  candidate: PromoteAuthoredPackCandidate,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);

/** The unpack use case: settle a request, then preview or apply it. */
export const PromoteAuthoredPack = {
  prepare: preparePromoteAuthoredPack,
  previewOrApply: previewOrApplyPromoteAuthoredPack,
} as const;

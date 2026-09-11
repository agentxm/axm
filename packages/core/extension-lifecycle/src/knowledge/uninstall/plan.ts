/**
 * Uninstalling a Knowledge bundle.
 *
 * Canonical Knowledge content that AXM never accepted ownership of belongs to
 * whoever put it there. A removal that would delete such content is refused
 * and says how to take ownership instead, so an unowned surface is preserved
 * rather than silently destroyed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  KnowledgeManager,
  KnowledgeUnavailable,
  buildUninstallOperation,
} from "@agentxm/extension-materialization";
import { makeWorkspaceRelativePath } from "@agentxm/extension-model/unstable/path-types";
import type { Plan, PlannedJobStep } from "@agentxm/workspace-operations";
import { resolveInstructionsConfig } from "@agentxm/workspace-projection";
import {
  WorkspaceMutations,
  acceptedCanonicalObservation,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  type KnowledgeExtensionTarget,
  type KnowledgeLockEntry,
  type WorkspaceLayout,
} from "@agentxm/workspace-state";

import { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { installRefused, type InstallStepRequirements } from "../../install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "../../uninstall/retention-policy.js";
import type { KnowledgeUninstallIntent } from "../../uninstall/vocabulary.js";

/** A target and, when AXM may not remove it, the reason it is protected. */
interface KnowledgeUninstallOwnership {
  readonly target: KnowledgeExtensionTarget;
  readonly blocker?: string;
}

const lockCanonicalRoot = (
  path: Path.Path,
  layout: WorkspaceLayout,
  locked: KnowledgeLockEntry,
): string =>
  computeExtensionPathsForLayout(
    path.join,
    layout,
    extensionPathSourceFromLockEntry(locked),
    "knowledge",
    locked.workspaceName,
  ).canonicalPath;

/** Settle whether this Knowledge bundle has anything to remove. */
export const parseKnowledgeUninstallRequest: (
  selector: string,
) => Effect.Effect<
  KnowledgeUninstallIntent,
  ExtensionLifecycleFailed,
  InstallStepRequirements | KnowledgeManager | FileSystem.FileSystem | Path.Path
> = Effect.fn("UninstallExtensions.parseKnowledgeRequest")(function* (selector: string) {
  const ws = yield* WorkspaceMutations;
  const manager = yield* KnowledgeManager;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target: KnowledgeExtensionTarget = { type: "knowledge", name: selector.trim() };

  return yield* Effect.gen(function* () {
    const configured =
      manager.getConfiguredSource === undefined
        ? Option.none<string>()
        : yield* manager.getConfiguredSource({ target });
    const installed = yield* manager.isInstalled({ target });
    const locked = yield* ws.getLockedKnowledgeEntry(target.name);
    const authoredPackagePresent =
      ws.layout.scope === "project" &&
      (yield* fs.exists(path.join(ws.layout.authoredRoot("knowledge"), target.name)));
    if (Option.isNone(configured) && Option.isNone(locked) && authoredPackagePresent) {
      return { targets: [] } satisfies KnowledgeUninstallIntent;
    }
    if (Option.isNone(configured) && Option.isNone(locked) && !installed) {
      return { targets: [] } satisfies KnowledgeUninstallIntent;
    }
    return { targets: [target] } satisfies KnowledgeUninstallIntent;
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: `Knowledge bundle "${target.name}" declaration could not be read`,
        cause,
      }),
    ),
  );
});

/**
 * Whether AXM has an accepted ownership fact for the content it would delete,
 * and whether the managed instructions target it would rewrite is inside the
 * workspace at all.
 */
const inspectOwnership: (
  target: KnowledgeExtensionTarget,
) => Effect.Effect<
  KnowledgeUninstallOwnership,
  ExtensionLifecycleFailed,
  InstallStepRequirements | FileSystem.FileSystem | Path.Path
> = Effect.fn("UninstallExtensions.inspectKnowledgeOwnership")(function* (
  target: KnowledgeExtensionTarget,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  return yield* Effect.gen(function* () {
    const configured = yield* ws.getConfiguredKnowledgeEntries();
    const locked = yield* ws.getLockedKnowledgeEntry(target.name);
    const graph = yield* ws.getDesiredStateGraph();
    const desired = graph.nodes.find(
      (node) => node.type === "knowledge" && node.name === target.name,
    );
    const acceptedObservation =
      desired === undefined
        ? Option.none()
        : yield* acceptedCanonicalObservation({
            workspace: ws,
            type: "knowledge",
            name: target.name,
          });
    const expectedCanonicalPath = Option.match(acceptedObservation, {
      onNone: () =>
        Option.isSome(locked) ? lockCanonicalRoot(path, ws.layout, locked.value) : undefined,
      onSome: (accepted) => accepted.observation.path,
    });
    const inventory = yield* ws.records.getExtensionInventory("knowledge", {});
    const actualPaths = inventory.items
      .filter((item) => item.name === target.name)
      .flatMap((item) => item.paths.map((itemPath) => path.resolve(ws.baseDir, itemPath)));
    const normalizedExpected =
      expectedCanonicalPath === undefined ? undefined : path.resolve(expectedCanonicalPath);
    const workspaceOwned = desired?.identity.startsWith("workspace:") === true;
    const hasAcceptedOwnership = workspaceOwned || Option.isSome(locked);
    const settingsPresent = configured[target.name] !== undefined;
    const instructionsConfig = yield* ws.getInstructionsConfig();
    const resolvedInstructions = resolveInstructionsConfig(
      Option.match(instructionsConfig, {
        onNone: () => undefined,
        onSome: (value) => (value === false ? undefined : value),
      }),
    );
    const instructionRelative = makeWorkspaceRelativePath(
      path,
      ws.baseDir,
      resolvedInstructions.fileName,
    );
    const ownershipBlocker =
      actualPaths.length === 0 || (hasAcceptedOwnership && normalizedExpected !== undefined)
        ? undefined
        : settingsPresent && !workspaceOwned
          ? `Cannot uninstall Knowledge bundle "${target.name}": canonical Knowledge content is present, but its accepted resolution is missing. AXM will preserve the unowned canonical surface. Run \`axm adopt <extension>\` to transfer it into AXM ownership, or leave it for its current owner.`
          : `Cannot uninstall Knowledge bundle "${target.name}": canonical Knowledge content has no accepted AXM ownership fact. AXM will preserve the unowned canonical surface. Run \`axm adopt <extension>\` to transfer it into AXM ownership, or leave it for its current owner.`;
    const blocker =
      ownershipBlocker ??
      (Option.isNone(instructionRelative)
        ? `Cannot uninstall Knowledge bundle "${target.name}": the managed instructions target is outside the workspace. Configure a workspace-relative instructions target and retry.`
        : undefined);
    return { target, ...(blocker === undefined ? {} : { blocker }) };
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: `Knowledge ownership for "${target.name}" could not be inspected`,
        cause,
      }),
    ),
  );
});

/** The closures a settled Knowledge removal becomes. */
export const planKnowledgeUninstall: (
  intent: KnowledgeUninstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | KnowledgeManager | FileSystem.FileSystem | Path.Path
> = Effect.fn("UninstallExtensions.planKnowledge")(function* (intent: KnowledgeUninstallIntent) {
  const ws = yield* WorkspaceMutations;
  const manager = yield* KnowledgeManager;
  const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

  /** The accepted ownership fact, not on-disk presence, decides removability. */
  const isAcceptedTargetPresent = (target: KnowledgeExtensionTarget) =>
    Effect.gen(function* () {
      const graph = yield* ws.getDesiredStateGraph();
      const desired = graph.nodes.find(
        (node) => node.type === "knowledge" && node.name === target.name,
      );
      const locked = yield* ws.getLockedKnowledgeEntry(target.name);
      return desired?.identity.startsWith("workspace:") === true || Option.isSome(locked);
    }).pipe(
      Effect.mapError(
        (cause) =>
          new KnowledgeUnavailable({
            detail: `Accepted ownership for Knowledge bundle "${target.name}" could not be read`,
            cause,
          }),
      ),
    );

  const ownership = yield* Effect.forEach(intent.targets, inspectOwnership);
  const steps = ownership.map((entry): PlannedJobStep<InstallStepRequirements> => {
    if (entry.blocker !== undefined) {
      return {
        key: `knowledge:${entry.target.name}`,
        readiness: "error",
        label: entry.target.name,
        errorMessage: entry.blocker,
      };
    }
    return buildUninstallOperation(
      { ...manager, isInstalled: () => isAcceptedTargetPresent(entry.target) },
      retentionPolicy,
      { target: entry.target, toStepFailure: lifecycleStepFailure },
    );
  });

  return {
    _tag: "Plan",
    name: "Uninstall knowledge",
    description: Option.some("Uninstall Open Knowledge Format bundle"),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});

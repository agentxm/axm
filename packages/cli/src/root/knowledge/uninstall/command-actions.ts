import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import { resolveInstructionsConfig } from "@agentxm/extension-management/unstable/agents";
import { buildUninstallOperation } from "@agentxm/extension-management/unstable/extensions";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  type KnowledgeExtensionRef,
  WorkspaceMutations,
  acceptedCanonicalObservation,
  type KnowledgeExtensionTarget,
  type WorkspaceLayout,
} from "@agentxm/extension-management/unstable/workspace";
import {
  KnowledgeManager,
  KnowledgeManagerLive,
} from "@agentxm/extension-management/unstable/knowledge";
import type { KnowledgeLockEntry } from "@agentxm/extension-management/unstable/lockfile";
import type { Plan, PlannedJobStep } from "@agentxm/extension-management/unstable/plan";
import { makeWorkspaceRelativePath } from "@agentxm/extension-model/unstable/path-types";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/workflows";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import type { UninstallKnowledgeCommandIntent } from "./intent.js";

export interface UninstallKnowledgeHandlerArgs {
  readonly name: string;
}

interface ParsedKnowledgeUninstallArgs {
  readonly name: string;
}

type KnowledgeUninstallActions = UninstallExtensionCommandWorkflowActions<
  UninstallKnowledgeHandlerArgs,
  ParsedKnowledgeUninstallArgs,
  UninstallKnowledgeCommandIntent
>;

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

export const UninstallKnowledgeCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const manager = yield* KnowledgeManager;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platformLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );

  const inspectOwnership = (
    target: KnowledgeExtensionTarget,
  ): Effect.Effect<KnowledgeUninstallOwnership, AppError> =>
    Effect.gen(function* () {
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
            }).pipe(Effect.provide(platformLayer));
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
      return {
        target,
        ...(blocker === undefined ? {} : { blocker }),
      };
    });

  const isAcceptedTargetPresent = (target: KnowledgeExtensionTarget) =>
    Effect.gen(function* () {
      const graph = yield* ws.getDesiredStateGraph();
      const desired = graph.nodes.find(
        (node) => node.type === "knowledge" && node.name === target.name,
      );
      const locked = yield* ws.getLockedKnowledgeEntry(target.name);
      return desired?.identity.startsWith("workspace:") === true || Option.isSome(locked);
    });

  const buildStep = (ownership: KnowledgeUninstallOwnership): PlannedJobStep => {
    if (ownership.blocker !== undefined) {
      return {
        key: `knowledge:${ownership.target.name}`,
        readiness: "error",
        label: ownership.target.name,
        errorMessage: ownership.blocker,
      };
    }
    return buildUninstallOperation<KnowledgeExtensionRef>(
      { ...manager, isInstalled: () => isAcceptedTargetPresent(ownership.target) },
      makeWorkspaceRetentionPolicy(ws),
      { target: ownership.target },
    );
  };

  return {
    parseArgs: (args) => Effect.succeed({ name: args.name.trim() }),
    finalizeIntent: (parsed): Effect.Effect<UninstallKnowledgeCommandIntent, AppError> =>
      Effect.gen(function* () {
        const target: KnowledgeExtensionTarget = { type: "knowledge", name: parsed.name };
        const configured =
          manager.getConfiguredSource === undefined
            ? Option.none<string>()
            : yield* manager.getConfiguredSource({ target });
        const installed = yield* manager.isInstalled({ target });
        const locked = yield* ws.getLockedKnowledgeEntry(target.name);
        const authoredPackagePresent =
          ws.layout.scope === "project" &&
          (yield* fs.exists(path.join(ws.layout.authoredRoot("knowledge"), target.name)).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "internal",
                detail: `Failed to inspect authored Knowledge package "${target.name}"`,
                cause,
              }),
            ),
          ));
        if (Option.isNone(configured) && Option.isNone(locked) && authoredPackagePresent) {
          return { targets: [] };
        }
        if (Option.isNone(configured) && Option.isNone(locked) && !installed) {
          return { targets: [] };
        }
        return { targets: [target] };
      }),
    buildUninstallPlan: (intent) =>
      Effect.gen(function* () {
        const ownership = yield* Effect.forEach(intent.targets, inspectOwnership);
        return {
          _tag: "Plan",
          name: "Uninstall knowledge",
          description: Option.some("Uninstall Open Knowledge Format bundle"),
          jobs: [
            {
              concurrency: 1,
              steps: ownership.map(buildStep),
            },
          ],
        } satisfies Plan;
      }),
  } satisfies KnowledgeUninstallActions;
}).pipe(
  Effect.provide(KnowledgeManagerLive),
  Effect.map((actions): KnowledgeUninstallActions => actions),
);

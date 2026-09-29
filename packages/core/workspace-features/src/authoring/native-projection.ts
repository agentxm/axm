import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { readExtensionManifest } from "@agentxm/extension-content";

import type {
  ExtensionFqnParts,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  HookManager,
  KnowledgeManager,
  RuleManager,
  NO_MATERIALIZATION_OBSERVATION,
  type ExtensionManagerFailure,
  type ManagerRequirements,
  type MaterializationObservation,
} from "@agentxm/workspace-kernel/materialization";
import type { JobStepArtifact } from "@agentxm/workspace-kernel/operations";
import type {
  InstallArtifactPresentation,
  InstallChange,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  computePackageContentHash,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";
import { AuthoringFailed } from "./errors.js";

/** Inspect staged content against final native destinations before publishing its source. */
export const preflightAuthoredNativeProjection = (args: {
  readonly identity: ExtensionFqnParts;
  readonly packageRoot: string;
  readonly enabled: boolean;
}): Effect.Effect<
  void,
  AuthoringFailed | ExtensionManagerFailure,
  ManagerRequirements | RuleManager | HookManager | KnowledgeManager
> =>
  Effect.gen(function* () {
    if (!args.enabled || !["hook", "rule", "knowledge"].includes(args.identity.type)) return;
    const location = yield* WorkspaceLocation;
    const { manifest } = yield* readExtensionManifest(args.packageRoot, args.identity.type).pipe(
      Effect.mapError(
        (cause) =>
          new AuthoringFailed({
            category: "validation",
            detail: "Prepared authored package is not valid",
            cause,
          }),
      ),
    );
    if (
      manifest.owner !== args.identity.owner ||
      manifest.name !== args.identity.name ||
      manifest.type !== args.identity.type
    ) {
      return yield* new AuthoringFailed({
        category: "validation",
        detail: "Prepared authored package identity does not match the requested identity",
      });
    }
    const details = {
      refType: "workspace" as const,
      scope: location.scope,
      owner: manifest.owner,
      name: manifest.name,
      version: manifest.version,
      location: args.packageRoot,
      sourceHash: yield* computePackageContentHash(args.packageRoot),
    };
    const options = { nativeInsertionEligibleNames: new Set<string>() };
    const source = { type: "workspace" as const, owner: manifest.owner, name: manifest.name };
    switch (manifest.type) {
      case "rule":
        yield* (yield* RuleManager).prepareProjection(
          [
            {
              ...details,
              type: "rule",
              source: { ...source, extensionType: "rule" },
              rule: { name: manifest.name },
            },
          ],
          options,
        );
        break;
      case "hook":
        yield* (yield* HookManager).prepareProjection(
          [
            {
              ...details,
              type: "hook",
              source: { ...source, extensionType: "hook" },
              hook: { name: manifest.name },
              ...(manifest.fallback === undefined ? {} : { fallback: manifest.fallback }),
            },
          ],
          options,
        );
        break;
      case "knowledge":
        yield* (yield* KnowledgeManager).prepareProjection(
          [
            {
              ...details,
              type: "knowledge",
              source: { ...source, extensionType: "knowledge" },
              knowledge: { name: manifest.name },
            },
          ],
          options,
        );
        break;
    }
  });

/** Attach actual native observations after the authored transition has settled. */
export const authoredNativeArtifact = (args: {
  readonly type: ExtensionType;
  readonly artifact: JobStepArtifact;
  readonly change: InstallChange;
  readonly projected: boolean;
  readonly materialization?: Option.Option<{ readonly observation: MaterializationObservation }>;
}): Effect.Effect<
  InstallArtifactPresentation,
  ExtensionManagerFailure,
  ManagerRequirements | RuleManager | HookManager | KnowledgeManager
> =>
  Effect.gen(function* () {
    const observation =
      args.materialization !== undefined && Option.isSome(args.materialization)
        ? args.materialization.value.observation
        : !args.projected
          ? NO_MATERIALIZATION_OBSERVATION
          : args.type === "rule"
            ? yield* (yield* RuleManager).aggregateProjectionObservation
            : args.type === "hook"
              ? yield* (yield* HookManager).aggregateProjectionObservation
              : args.type === "knowledge"
                ? yield* (yield* KnowledgeManager).aggregateProjectionObservation
                : NO_MATERIALIZATION_OBSERVATION;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const targetPaths = new Set<string>();
    const targets = [
      ...(args.artifact.targets ?? []),
      ...observation.targets.map((target) => ({ ...target, change: args.change })),
    ].filter((target) => {
      const absolute = path.resolve(location.baseDir, target.path);
      if (targetPaths.has(absolute)) return false;
      targetPaths.add(absolute);
      return true;
    });
    return {
      ...args.artifact,
      ...(observation.agents.length === 0 ? {} : { agents: observation.agents }),
      ...(observation.nativeLocations === undefined
        ? {}
        : { nativeLocations: observation.nativeLocations }),
      targets,
    } satisfies InstallArtifactPresentation;
  });

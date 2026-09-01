import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  AcceptedResolutionMissing,
  InlineExtensionSourceMissing,
  SupersededCanonicalRemovalFailed,
  type PackageContentHashFailed,
  type WorkspaceSourceInvalid,
} from "./errors.js";
import type { PathTraversalDetected } from "../utils/path-safety.js";
import type { WorkspaceSnapshotError } from "./transaction.js";
import {
  hookLockEntryToRef,
  knowledgeLockEntryToRef,
  mcpServerLockEntryToRef,
  packLockEntryToRef,
  ruleLockEntryToRef,
  skillLockEntryToRef,
  subagentLockEntryToRef,
  type LockEntryToRefError,
} from "./lock-entry-to-ref.js";
import {
  observeCanonicalExtension,
  type AcceptedExtensionResolution,
  type CanonicalObservation,
} from "./canonical-observation.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
} from "./extension-paths.js";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import { protectWorkspacePath } from "./transaction.js";
import { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";
import type {
  WorkspaceLockfileReadFailure,
  WorkspaceMutationsService,
  WorkspaceStateReadFailure,
} from "./service-interface.js";

interface AcceptedCanonicalRefArgs {
  readonly workspace: WorkspaceMutationsService;
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
}

/** Every failure the accepted-canonical reconstruction functions can produce. */
export type AcceptedCanonicalRefError =
  | WorkspaceStateReadFailure
  | LockEntryToRefError
  | AcceptedResolutionMissing
  | InlineExtensionSourceMissing
  | WorkspaceSourceInvalid
  | PathTraversalDetected
  | PackageContentHashFailed;

export interface AcceptedCanonicalObservation {
  readonly desired: DesiredExtensionNode;
  readonly accepted?: AcceptedExtensionResolution;
  readonly observation: CanonicalObservation;
}

export interface UsableAcceptedCanonicalObservation extends AcceptedCanonicalObservation {
  readonly observation: CanonicalObservation & { readonly status: "usable"; readonly path: string };
}

export interface UsableAcceptedCanonical extends UsableAcceptedCanonicalObservation {
  readonly ref: ExtensionRef;
}

/** Canonical package AXM may delete when removing desired state. Authored source is durable. */
export const removableAcceptedCanonicalPath = (
  canonical: Option.Option<AcceptedCanonicalObservation>,
): Option.Option<string> =>
  Option.flatMap(canonical, (state) =>
    state.desired.identity.startsWith("workspace:")
      ? Option.none()
      : Option.fromUndefinedOr(state.observation.path),
  );

const getAcceptedResolution = (
  workspace: WorkspaceMutationsService,
  type: DesiredExtensionNode["type"],
  name: string,
): Effect.Effect<Option.Option<AcceptedExtensionResolution>, WorkspaceLockfileReadFailure> => {
  const read = (): Effect.Effect<
    Option.Option<AcceptedExtensionResolution>,
    WorkspaceLockfileReadFailure
  > => {
    switch (type) {
      case "skill":
        return workspace.getLockedSkill(name);
      case "mcp-server":
        return workspace.getLockedMcpServer(name);
      case "subagent":
        return workspace.getLockedSubagent(name);
      case "rule":
        return workspace.getLockedRuleEntry(name);
      case "hook":
        return workspace.getLockedHookEntry(name);
      case "knowledge":
        return workspace.getLockedKnowledgeEntry(name);
      case "pack":
        return workspace.getLockedPack(name);
    }
  };
  return read();
};

/** Exact acquired canonical path reconstructed directly from accepted lock authority. */
export const acceptedLockedCanonicalPath = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<Option.Option<string>, WorkspaceLockfileReadFailure, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const accepted = yield* getAcceptedResolution(args.workspace, args.type, args.name);
    return Option.map(
      accepted,
      (entry) =>
        computeExtensionPathsForLayout(
          path.join,
          args.workspace.layout,
          extensionPathSourceFromLockEntry(entry),
          toExtensionTypePlural(args.type),
          entry.workspaceName,
        ).canonicalPath,
    );
  });

const workspaceNameFromRef = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "mcp-server":
      return ref.server.name;
    case "subagent":
      return ref.subagent.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
    case "pack":
      return ref.pack.name;
  }
};

/**
 * Capture exact cleanup for a superseded accepted package. The old path is
 * read before the lock transition; the returned effect runs afterward and
 * removes only that path when the replacement canonical path differs.
 */
export const prepareAcceptedCanonicalTransition = (
  args: AcceptedCanonicalRefArgs & { readonly ref: ExtensionRef },
): Effect.Effect<
  Effect.Effect<void, WorkspaceSnapshotError | SupersededCanonicalRemovalFailed>,
  WorkspaceLockfileReadFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const previous = yield* acceptedLockedCanonicalPath(args);
    if (Option.isNone(previous)) return yield* Effect.succeed(Effect.void);

    const next = computeExtensionPathsForLayout(
      path.join,
      args.workspace.layout,
      args.ref,
      toExtensionTypePlural(args.ref.type),
      workspaceNameFromRef(args.ref),
    ).canonicalPath;
    if (path.resolve(previous.value) === path.resolve(next)) {
      return yield* Effect.succeed(Effect.void);
    }

    return yield* Effect.succeed(
      Effect.gen(function* () {
        yield* protectWorkspacePath(previous.value);
        yield* fs
          .remove(previous.value, { recursive: true, force: true })
          .pipe(
            Effect.mapError(
              (cause) => new SupersededCanonicalRemovalFailed({ path: previous.value, cause }),
            ),
          );
      }),
    );
  });

const lockRefDeps = (workspace: WorkspaceMutationsService, path: Path.Path) => ({
  baseDir: workspace.baseDir,
  path,
  scope: workspace.scope,
  getConfiguredSourceByName: (name: string) => workspace.getConfiguredSourceByName(name),
});

const missingAccepted = (label: string, name: string) =>
  new AcceptedResolutionMissing({ label, name });

const refFromAcceptedResolution = (
  workspace: WorkspaceMutationsService,
  type: DesiredExtensionNode["type"],
  name: string,
): Effect.Effect<ExtensionRef, AcceptedCanonicalRefError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const deps = lockRefDeps(workspace, path);
    switch (type) {
      case "skill": {
        const entry = yield* workspace.getLockedSkill(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Skill", name)),
          onSome: (value) => skillLockEntryToRef(name, value, deps),
        });
      }
      case "mcp-server": {
        const entry = yield* workspace.getLockedMcpServer(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("MCP", name)),
          onSome: (value) => mcpServerLockEntryToRef(name, value, deps),
        });
      }
      case "subagent": {
        const entry = yield* workspace.getLockedSubagent(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Subagent", name)),
          onSome: (value) => subagentLockEntryToRef(name, value, deps),
        });
      }
      case "rule": {
        const entry = yield* workspace.getLockedRuleEntry(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Rule", name)),
          onSome: (value) => ruleLockEntryToRef(name, value, deps),
        });
      }
      case "hook": {
        const entry = yield* workspace.getLockedHookEntry(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Hook", name)),
          onSome: (value) => hookLockEntryToRef(name, value, deps),
        });
      }
      case "knowledge": {
        const entry = yield* workspace.getLockedKnowledgeEntry(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Knowledge", name)),
          onSome: (value) => knowledgeLockEntryToRef(name, value, deps),
        });
      }
      case "pack": {
        const entry = yield* workspace.getLockedPack(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Pack", name)),
          onSome: (value) => packLockEntryToRef(name, value, deps),
        });
      }
    }
  });

/** Reconstruct a ref directly from accepted lock authority without desired reachability. */
export const acceptedLockedResolutionRef = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<ExtensionRef>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const accepted = yield* getAcceptedResolution(args.workspace, args.type, args.name);
    if (Option.isNone(accepted)) return Option.none();
    return Option.some(yield* refFromAcceptedResolution(args.workspace, args.type, args.name));
  });

const refForDesired = (
  workspace: WorkspaceMutationsService,
  desired: DesiredExtensionNode,
): Effect.Effect<ExtensionRef, AcceptedCanonicalRefError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (desired.source === undefined) {
      return yield* new InlineExtensionSourceMissing({ name: desired.name });
    }
    if (desired.identity.startsWith("bundled:")) {
      const path = yield* Path.Path;
      return yield* resolveWorkspaceExtensionRef({
        settingsName: desired.name,
        source: "workspace",
        expectedType: desired.type,
        layout: workspace.layout,
        scope: workspace.scope,
        staticPackage: {
          owner: decodeHandleSync("@agentxm"),
          name: decodeExtensionNameSync(desired.name),
          root:
            workspace.layout.scope === "project"
              ? path.join(
                  workspace.layout.acquiredRoot,
                  "agentxm",
                  "@agentxm",
                  "skills",
                  desired.name,
                )
              : path.join(
                  workspace.layout.acquiredRoot,
                  "agentxm",
                  "@agentxm",
                  "skills",
                  desired.name,
                ),
        },
      });
    }
    if (desired.identity.startsWith("workspace:")) {
      return yield* resolveWorkspaceExtensionRef({
        settingsName: desired.name,
        source: desired.source,
        expectedType: desired.type,
        layout: workspace.layout,
        scope: workspace.scope,
      });
    }
    return yield* refFromAcceptedResolution(workspace, desired.type, desired.name);
  });

/**
 * Reconstruct the immutable source reference recorded for a desired extension,
 * even when its canonical materialization is absent or divergent.
 */
export const acceptedResolutionRef = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<ExtensionRef>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const graph = yield* args.workspace.getDesiredStateGraph();
    const desired = graph.nodes.find((node) => node.type === args.type && node.name === args.name);
    if (desired === undefined || desired.identity.startsWith("workspace:")) {
      return Option.none();
    }
    return yield* acceptedLockedResolutionRef(args);
  });

export const acceptedCanonicalObservation = ({
  workspace,
  type,
  name,
}: AcceptedCanonicalRefArgs): Effect.Effect<
  Option.Option<AcceptedCanonicalObservation>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const graph = yield* workspace.getDesiredStateGraph();
    const desired = graph.nodes.find((node) => node.type === type && node.name === name);
    if (desired === undefined) return Option.none();
    const accepted = yield* getAcceptedResolution(workspace, type, name);
    const observation = yield* observeCanonicalExtension({
      layout: workspace.layout,
      desired,
      accepted: Option.getOrUndefined(accepted),
    });
    return Option.some({
      desired,
      ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
      observation,
    });
  });

export const usableAcceptedCanonicalObservation = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<UsableAcceptedCanonicalObservation>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path
> =>
  acceptedCanonicalObservation(args).pipe(
    Effect.map(
      Option.flatMap((value) =>
        value.observation.status === "usable" && value.observation.path !== undefined
          ? Option.some({
              ...value,
              observation: { ...value.observation, status: "usable", path: value.observation.path },
            })
          : Option.none(),
      ),
    ),
  );

export const usableAcceptedCanonical = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<UsableAcceptedCanonical>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const canonical = yield* usableAcceptedCanonicalObservation(args);
    if (Option.isNone(canonical)) return Option.none();
    const ref = yield* refForDesired(args.workspace, canonical.value.desired);
    return Option.some({ ...canonical.value, ref });
  });

export const usableAcceptedCanonicalRef = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<ExtensionRef>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path
> => usableAcceptedCanonical(args).pipe(Effect.map(Option.map((canonical) => canonical.ref)));

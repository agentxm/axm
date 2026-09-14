import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
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
import type { WorkspaceSnapshotError } from "@agentxm/workspace-transactions";
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
import { protectWorkspacePath } from "@agentxm/workspace-transactions";
import { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import { LockfileReader } from "./lockfile-reader.js";
import { SettingsReader, type SettingsReaderService } from "./settings-reader.js";
import type { WorkspaceStateReadFailure } from "./service-interface.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";

interface AcceptedCanonicalRefArgs {
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
  /** Proposed authority when preparing a transition before publishing intent. */
  readonly desired?: DesiredExtensionNode;
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
  type: DesiredExtensionNode["type"],
  name: string,
): Effect.Effect<
  Option.Option<AcceptedExtensionResolution>,
  WorkspaceStateReadFailure,
  LockfileReader
> => {
  const read = (): Effect.Effect<
    Option.Option<AcceptedExtensionResolution>,
    WorkspaceStateReadFailure,
    LockfileReader
  > =>
    Effect.gen(function* () {
      const lockfile = yield* LockfileReader;
      switch (type) {
        case "skill":
          return yield* lockfile.entry("skill", name);
        case "mcp-server":
          return yield* lockfile.mcpServerForConnection(name);
        case "subagent":
          return yield* lockfile.entry("subagent", name);
        case "rule":
          return yield* lockfile.entry("rule", name);
        case "hook":
          return yield* lockfile.entry("hook", name);
        case "knowledge":
          return yield* lockfile.entry("knowledge", name);
        case "pack":
          return yield* lockfile.entry("pack", name);
      }
    });
  return read();
};

/** Exact acquired canonical path reconstructed directly from accepted lock authority. */
export const acceptedLockedCanonicalPath = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<string>,
  WorkspaceStateReadFailure,
  Path.Path | WorkspaceLocation | LockfileReader
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const accepted = yield* getAcceptedResolution(args.type, args.name);
    return Option.map(
      accepted,
      (entry) =>
        computeExtensionPathsForLayout(
          path.join,
          layout,
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
  WorkspaceStateReadFailure,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const previous = yield* acceptedLockedCanonicalPath(args);
    if (Option.isNone(previous)) return yield* Effect.succeed(Effect.void);

    const next = computeExtensionPathsForLayout(
      path.join,
      layout,
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

const lockRefDeps = (
  location: WorkspaceLocationService,
  settings: SettingsReaderService,
  path: Path.Path,
) => ({
  baseDir: location.baseDir,
  path,
  scope: location.scope,
  getConfiguredSourceByName: (name: string) => settings.sourceByName(name),
});

const missingAccepted = (label: string, name: string) =>
  new AcceptedResolutionMissing({ label, name });

const refFromAcceptedResolution = (
  type: DesiredExtensionNode["type"],
  name: string,
): Effect.Effect<
  ExtensionRef,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const deps = lockRefDeps(location, settings, path);
    switch (type) {
      case "skill": {
        const entry = yield* lockfile.entry("skill", name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Skill", name)),
          onSome: (value) => skillLockEntryToRef(name, value, deps),
        });
      }
      case "mcp-server": {
        const entry = yield* lockfile.mcpServerForConnection(name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("MCP", name)),
          onSome: (value) => mcpServerLockEntryToRef(name, value, deps),
        });
      }
      case "subagent": {
        const entry = yield* lockfile.entry("subagent", name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Subagent", name)),
          onSome: (value) => subagentLockEntryToRef(name, value, deps),
        });
      }
      case "rule": {
        const entry = yield* lockfile.entry("rule", name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Rule", name)),
          onSome: (value) => ruleLockEntryToRef(name, value, deps),
        });
      }
      case "hook": {
        const entry = yield* lockfile.entry("hook", name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Hook", name)),
          onSome: (value) => hookLockEntryToRef(name, value, deps),
        });
      }
      case "knowledge": {
        const entry = yield* lockfile.entry("knowledge", name);
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(missingAccepted("Knowledge", name)),
          onSome: (value) => knowledgeLockEntryToRef(name, value, deps),
        });
      }
      case "pack": {
        const entry = yield* lockfile.entry("pack", name);
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
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const accepted = yield* getAcceptedResolution(args.type, args.name);
    if (Option.isNone(accepted)) return Option.none();
    return Option.some(yield* refFromAcceptedResolution(args.type, args.name));
  });

const refForDesired = (
  desired: DesiredExtensionNode,
): Effect.Effect<
  ExtensionRef,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    if (desired.source === undefined) {
      return yield* new InlineExtensionSourceMissing({ name: desired.name });
    }
    if (desired.identity.startsWith("bundled:")) {
      const path = yield* Path.Path;
      return yield* resolveWorkspaceExtensionRef({
        settingsName: desired.name,
        source: "workspace",
        expectedType: desired.type,
        layout,
        scope: location.scope,
        staticPackage: {
          owner: decodeHandleSync("@agentxm"),
          name: decodeExtensionNameSync(desired.name),
          root:
            layout.scope === "project"
              ? path.join(layout.acquiredRoot, "agentxm", "@agentxm", "skills", desired.name)
              : path.join(layout.acquiredRoot, "agentxm", "@agentxm", "skills", desired.name),
        },
      });
    }
    if (desired.identity.startsWith("workspace:")) {
      return yield* resolveWorkspaceExtensionRef({
        settingsName: desired.name,
        source: desired.source,
        expectedType: desired.type,
        layout,
        scope: location.scope,
      });
    }
    return yield* refFromAcceptedResolution(desired.type, desired.name);
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
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
> =>
  Effect.gen(function* () {
    const desiredState = yield* DesiredStateReader;
    const desired =
      args.desired ??
      (yield* desiredState.graph()).nodes.find(
        (node) => node.type === args.type && node.name === args.name,
      );
    if (desired === undefined || desired.identity.startsWith("workspace:")) {
      return Option.none();
    }
    return yield* acceptedLockedResolutionRef(args);
  });

export const acceptedCanonicalObservation = ({
  type,
  name,
  desired: proposed,
}: AcceptedCanonicalRefArgs): Effect.Effect<
  Option.Option<AcceptedCanonicalObservation>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const desiredState = yield* DesiredStateReader;
    const desired =
      proposed ??
      (yield* desiredState.graph()).nodes.find((node) => node.type === type && node.name === name);
    if (desired === undefined) return Option.none();
    const accepted = yield* getAcceptedResolution(type, name);
    const observation = yield* observeCanonicalExtension({
      layout,
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
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
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
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
> =>
  Effect.gen(function* () {
    const canonical = yield* usableAcceptedCanonicalObservation(args);
    if (Option.isNone(canonical)) return Option.none();
    const ref = yield* refForDesired(canonical.value.desired);
    // A usable local acquisition is the accepted copy, even if the original
    // directory has changed or disappeared. Keep sourcePath as its identity.
    const retainedRef =
      ref.refType === "local" ? { ...ref, location: canonical.value.observation.path } : ref;
    return Option.some({ ...canonical.value, ref: retainedRef });
  });

export const usableAcceptedCanonicalRef = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<ExtensionRef>,
  AcceptedCanonicalRefError,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
> => usableAcceptedCanonical(args).pipe(Effect.map(Option.map((canonical) => canonical.ref)));

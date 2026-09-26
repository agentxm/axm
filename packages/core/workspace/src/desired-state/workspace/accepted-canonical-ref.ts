import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import * as Effect from "effect/Effect";
import { BUNDLED_SKILL_OWNER, bundledSkillCanonicalRoot } from "./extension-paths.js";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
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
import type { WorkspaceSnapshotError } from "../../transitions/settlement/index.js";
import { lockEntryToRef, type LockEntry, type LockEntryToRefError } from "./lock-entry.js";
import { observeCanonicalExtension, type CanonicalObservation } from "./canonical-observation.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
} from "./extension-paths.js";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import { protectWorkspacePath } from "../../transitions/settlement/index.js";
import { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import { LockfileReader } from "./lockfile-reader.js";
import { SettingsReader, type SettingsReaderService } from "./settings-reader.js";
import type { WorkspaceStateReadFailure } from "./contracts.js";
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
  readonly accepted?: LockEntry;
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
    state.desired.identity.authority === "workspace"
      ? Option.none()
      : Option.fromUndefinedOr(state.observation.path),
  );

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
    const accepted = yield* (yield* LockfileReader).acceptedEntry(args.type, args.name);
    return Option.map(
      accepted,
      (entry) =>
        computeExtensionPathsForLayout(
          path.join,
          layout,
          extensionPathSourceFromLockEntry(entry),
          toExtensionTypePlural(args.type),
          entry.identity.name,
        ).canonicalPath,
    );
  });

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
      extensionRefName(args.ref),
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

/** The label a missing accepted row reports for each extension type. */
const lockEntryLabels: Record<InstallableExtensionType, string> = {
  skill: "Skill",
  "mcp-server": "MCP",
  subagent: "Subagent",
  rule: "Rule",
  hook: "Hook",
  knowledge: "Knowledge",
  pack: "Pack",
};

const refFromAcceptedResolution = <T extends InstallableExtensionType>(
  type: T,
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
    const entry = yield* (yield* LockfileReader).acceptedEntry(type, name);
    if (Option.isNone(entry)) return yield* missingAccepted(lockEntryLabels[type], name);
    return yield* lockEntryToRef[type](name, entry.value, lockRefDeps(location, settings, path));
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
    const accepted = yield* (yield* LockfileReader).acceptedEntry(args.type, args.name);
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
    if (desired.identity.authority === "bundled") {
      const path = yield* Path.Path;
      return yield* resolveWorkspaceExtensionRef({
        settingsName: desired.name,
        source: "workspace",
        expectedType: desired.type,
        layout,
        scope: location.scope,
        staticPackage: {
          owner: decodeHandleSync(BUNDLED_SKILL_OWNER),
          name: decodeExtensionNameSync(desired.name),
          root: bundledSkillCanonicalRoot(path.join, layout, desired.name),
        },
      });
    }
    if (desired.identity.authority === "workspace") {
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
    if (desired === undefined || desired.identity.authority === "workspace") {
      return Option.none();
    }
    return yield* acceptedLockedResolutionRef(args);
  });

/** Observe one desired node against the accepted resolution its type and name resolve to. */
export const observeDesiredCanonical = (
  desired: DesiredExtensionNode,
): Effect.Effect<
  AcceptedCanonicalObservation,
  WorkspaceStateReadFailure,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const accepted = yield* (yield* LockfileReader).acceptedEntry(desired.type, desired.name);
    const observation = yield* observeCanonicalExtension({
      layout,
      desired,
      accepted: Option.getOrUndefined(accepted),
    });
    return {
      desired,
      ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
      observation,
    };
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
    const desiredState = yield* DesiredStateReader;
    const desired =
      proposed ??
      (yield* desiredState.graph()).nodes.find((node) => node.type === type && node.name === name);
    if (desired === undefined) return Option.none();
    return Option.some(yield* observeDesiredCanonical(desired));
  });

const asUsable = (
  value: AcceptedCanonicalObservation,
): Option.Option<UsableAcceptedCanonicalObservation> =>
  value.observation.status === "usable" && value.observation.path !== undefined
    ? Option.some({
        ...value,
        observation: { ...value.observation, status: "usable", path: value.observation.path },
      })
    : Option.none();

export const usableAcceptedCanonicalObservation = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<UsableAcceptedCanonicalObservation>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
> => acceptedCanonicalObservation(args).pipe(Effect.map(Option.flatMap(asUsable)));

/**
 * The usable accepted package an observation already established, with the
 * ref it is restored from. Reading the ref does not observe the package again.
 */
export const usableAcceptedCanonicalFrom = (
  canonical: AcceptedCanonicalObservation,
): Effect.Effect<
  Option.Option<UsableAcceptedCanonical>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const usable = asUsable(canonical);
    if (Option.isNone(usable)) return Option.none();
    const ref = yield* refForDesired(usable.value.desired);
    // A usable local acquisition is the accepted copy, even if the original
    // directory has changed or disappeared. Keep sourcePath as its identity.
    const retainedRef =
      ref.refType === "local" ? { ...ref, location: usable.value.observation.path } : ref;
    return Option.some({ ...usable.value, ref: retainedRef });
  });

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
  acceptedCanonicalObservation(args).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Option.none()),
        onSome: usableAcceptedCanonicalFrom,
      }),
    ),
  );

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

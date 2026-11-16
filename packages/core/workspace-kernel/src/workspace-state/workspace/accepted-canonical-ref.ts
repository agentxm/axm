import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import * as Effect from "effect/Effect";
import {
  BUNDLED_SKILL_OWNER,
  bundledSkillCanonicalRoot,
  computeExtensionPathsForLayout,
} from "./extension-paths.js";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import type { WorkspaceLayout } from "./layout.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { Lockfile } from "../desired/lockfile/schema.js";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  decodeExtensionNameSync,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  AcceptedResolutionMissing,
  InlineExtensionSourceMissing,
  SupersededCanonicalRemovalFailed,
  type PackageContentHashFailed,
  type WorkspaceSourceInvalid,
} from "./errors.js";
import type { PathTraversalDetected } from "../utils/path-safety.js";
import { type WorkspaceSnapshotError, protectWorkspacePath } from "../../settlement/index.js";
import {
  extensionPathSourceFromLockEntry,
  lockEntryToRef,
  type LockEntry,
  type LockEntryToRefError,
} from "./lock-entry.js";
import {
  capturedManifestFor,
  observeCanonicalExtensionCapturing,
  type VerifiedCanonicalTree,
  judgeCanonicalBeforeContent,
  type CanonicalObservation,
  type CapturedManifest,
  type CapturedSubagentPackage,
  type ObservedTreeDigests,
} from "./canonical-observation.js";
import type { CapturedTreeWalk } from "./materialized-tree.js";
import { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "./desired-state-graph.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import type { AcceptedEntryOptions, DesiredStateReaderService } from "./read-contracts.js";
import type { LockEntryByType } from "./entry-accessors.js";
import { LockfileReader } from "./lockfile-reader.js";
import { acceptedRowKey } from "./accepted-reachability.js";
import { lockEntries } from "./entry-accessors.js";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { SettingsReader, type SettingsReaderService } from "./settings-reader.js";
import type { WorkspaceStateReadFailure } from "./contracts.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";

interface AcceptedCanonicalRefArgs {
  readonly type: DesiredExtensionNode["type"];
  readonly name: string;
  /** Proposed authority when preparing a transition before publishing intent. */
  readonly desired?: DesiredExtensionNode;
}

/**
 * A ref the caller resolved earlier in the same call for the authored package
 * `desired` names, under the layout and scope the restoration would resolve
 * it with; `None` resolves the package as usual.
 */
type PreparedWorkspaceRef = (
  desired: DesiredExtensionNode,
  resolution: { readonly layout: WorkspaceLayout; readonly scope: WorkspaceScope },
) => Option.Option<ExtensionRef>;

interface UsableAcceptedCanonicalArgs extends AcceptedCanonicalRefArgs {
  readonly preparedWorkspaceRef?: PreparedWorkspaceRef;
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
  /** Another accepted binding still owns this complete package. */
  readonly sharedPackage?: boolean;
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
    state.desired.identity.authority === "workspace" || state.sharedPackage === true
      ? Option.none()
      : Option.fromUndefinedOr(state.observation.path),
  );

/** Accepted package ownership survives until every binding has been retired. */
const hasOtherPackageBinding = (args: {
  readonly path: Path.Path;
  readonly layout: WorkspaceLayout;
  readonly lockfile: Lockfile;
  readonly canonicalPath: string;
  readonly excluded: { readonly type: InstallableExtensionType; readonly key: string };
}): boolean =>
  installableExtensionTypes.some((type) =>
    Object.entries(lockEntries[type].entries(args.lockfile)).some(
      ([key, entry]) =>
        !(type === args.excluded.type && key === args.excluded.key) &&
        args.path.resolve(
          computeExtensionPathsForLayout(
            args.path.join,
            args.layout,
            extensionPathSourceFromLockEntry(entry),
            toExtensionTypePlural(type),
            entry.identity.name,
          ).canonicalPath,
        ) === args.path.resolve(args.canonicalPath),
    ),
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
  Effect.Effect<
    void,
    WorkspaceStateReadFailure | WorkspaceSnapshotError | SupersededCanonicalRemovalFailed
  >,
  WorkspaceStateReadFailure,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const reader = yield* LockfileReader;
    const previous = yield* acceptedLockedCanonicalPath(args);
    if (Option.isNone(previous)) return yield* Effect.succeed(Effect.void);

    const next = computeExtensionPathsForLayout(
      path.join,
      layout,
      args.ref,
      toExtensionTypePlural(args.ref.type),
      args.ref.type === "mcp-server" &&
        "nativeComponent" in args.ref &&
        args.ref.nativeComponent !== undefined
        ? args.ref.name
        : extensionRefName(args.ref),
    ).canonicalPath;
    if (path.resolve(previous.value) === path.resolve(next)) {
      return yield* Effect.succeed(Effect.void);
    }

    return yield* Effect.succeed(
      Effect.gen(function* () {
        if (
          hasOtherPackageBinding({
            path,
            layout,
            lockfile: yield* reader.lockfile,
            canonicalPath: previous.value,
            excluded: { type: args.type, key: args.name },
          })
        )
          return;
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

/** The ref the accepted row already read for `type` and `name` is restored from. */
const refFromAcceptedEntry = <T extends InstallableExtensionType>(
  type: T,
  name: string,
  entry: LockEntryByType[T],
): Effect.Effect<
  ExtensionRef,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const ref = yield* lockEntryToRef[type](name, entry, lockRefDeps(location, settings, path));
    if (ref.type === "mcp-server" && (ref.refType === "local" || ref.refType === "git-hosted")) {
      const nativeComponent = (yield* settings.entries("mcp-server"))[name]?.nativeComponent;
      if (nativeComponent !== undefined) return { ...ref, nativeComponent };
    }
    return ref;
  });

const refFromAcceptedResolution = <T extends InstallableExtensionType>(
  type: T,
  name: string,
): Effect.Effect<
  ExtensionRef,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const entry = yield* (yield* LockfileReader).acceptedEntry(type, name);
    if (Option.isNone(entry)) return yield* missingAccepted(lockEntryLabels[type], name);
    return yield* refFromAcceptedEntry(type, name, entry.value);
  });

/**
 * The graph `reader.graph()` returned to the caller's same call, for the
 * accepted-row lookup that follows it with nothing written between.
 */
const currentGraph = (
  reader: DesiredStateReaderService,
  graph: DesiredStateGraph,
): AcceptedEntryOptions => ({ current: { reader, graph } });

const lockedResolutionRef = (
  args: AcceptedCanonicalRefArgs,
  options?: AcceptedEntryOptions,
): Effect.Effect<
  Option.Option<ExtensionRef>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const accepted = yield* (yield* LockfileReader).acceptedEntry(args.type, args.name, options);
    if (Option.isNone(accepted)) return Option.none();
    return Option.some(yield* refFromAcceptedEntry(args.type, args.name, accepted.value));
  });

/** Reconstruct a ref directly from accepted lock authority without desired reachability. */
export const acceptedLockedResolutionRef = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<ExtensionRef>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> => lockedResolutionRef(args);

/**
 * The package root an observation in the same call found usable, with the
 * manifest text it read there.
 */
interface ObservedPackage {
  readonly root: string;
  readonly manifest: Option.Option<CapturedManifest>;
}

/**
 * The decode an observation in the same call made of the manifest of `type`
 * at the root it found usable, for the resolution of that root; `None` when
 * it made none, and the resolution reads the manifest itself.
 */
const preparedFromObserved = (
  path: Path.Path,
  observed: ObservedPackage | undefined,
  type: DesiredExtensionNode["type"],
) =>
  observed === undefined
    ? Option.none()
    : Option.map(capturedManifestFor(path, observed.manifest, observed.root, type), (manifest) => ({
        prepared: {
          root: observed.root,
          type,
          manifest: Effect.succeed({ manifest }),
        },
      }));

const refForDesired = (
  desired: DesiredExtensionNode,
  preparedWorkspaceRef?: PreparedWorkspaceRef,
  observed?: ObservedPackage,
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
      // The observation already decoded this root's manifest with the same
      // grammar; the resolution uses that decode only for the root it resolves.
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
        ...Option.getOrElse(preparedFromObserved(path, observed, desired.type), () => ({})),
      });
    }
    if (desired.identity.authority === "workspace") {
      const prepared =
        preparedWorkspaceRef === undefined
          ? Option.none<ExtensionRef>()
          : preparedWorkspaceRef(desired, { layout, scope: location.scope });
      if (Option.isSome(prepared)) return prepared.value;
      // The observation already decoded this root's manifest with the same
      // grammar; the resolution uses that decode only for the root it resolves.
      const path = yield* Path.Path;
      return yield* resolveWorkspaceExtensionRef({
        settingsName: desired.name,
        source: desired.source,
        expectedType: desired.type,
        layout,
        scope: location.scope,
        ...Option.getOrElse(preparedFromObserved(path, observed, desired.type), () => ({})),
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
    if (args.desired !== undefined) {
      if (args.desired.identity.authority === "workspace") return Option.none();
      return yield* lockedResolutionRef(args);
    }
    const graph = yield* desiredState.graph();
    const desired = graph.nodes.find((node) => node.type === args.type && node.name === args.name);
    if (desired === undefined || desired.identity.authority === "workspace") {
      return Option.none();
    }
    return yield* lockedResolutionRef(args, currentGraph(desiredState, graph));
  });

/**
 * The accepted row of `desired`, with the lockfile that lookup read, which
 * the caller's same call may judge package sharing against.
 */
const acceptedEntryOf = (desired: DesiredExtensionNode, current?: AcceptedEntryOptions) =>
  Effect.gen(function* () {
    let read: Lockfile | undefined;
    const accepted = yield* (yield* LockfileReader).acceptedEntry(desired.type, desired.name, {
      ...current,
      receiveLockfile: (lockfile) => {
        read = lockfile;
      },
    });
    return { accepted, lockfile: read };
  });

const observeDesiredCanonicalCapturingWith = (
  desired: DesiredExtensionNode,
  current?: AcceptedEntryOptions,
  digestAcceptedTree?: (accepted: LockEntry) => boolean,
  retainTreeWalk?: boolean,
) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const { accepted, lockfile } = yield* acceptedEntryOf(desired, current);
    return yield* observeAcceptedCanonicalCapturing(desired, accepted, layout, {
      lockfile,
      ...(digestAcceptedTree === undefined ? {} : { digestAcceptedTree }),
      ...(retainTreeWalk === true ? { retainTreeWalk } : {}),
    });
  });

/**
 * Observe one desired node against the accepted row already read for it.
 * `lockfile` is the one that row's lookup read in the same call; without it,
 * package sharing is judged against a lockfile read here.
 */
const observeAcceptedCanonicalCapturing = (
  desired: DesiredExtensionNode,
  accepted: Option.Option<LockEntry>,
  layout: WorkspaceLayout,
  prepared: {
    readonly verifiedTree?: VerifiedCanonicalTree;
    readonly judged?: ReturnType<typeof judgeCanonicalBeforeContent>;
    readonly lockfile?: Lockfile | undefined;
    readonly digestAcceptedTree?: (accepted: LockEntry) => boolean;
    readonly retainTreeWalk?: boolean;
  },
) =>
  Effect.gen(function* () {
    const { verifiedTree, judged, digestAcceptedTree, retainTreeWalk } = prepared;
    const reader = yield* LockfileReader;
    const { observation, manifest, subagentPackage, digests, treeWalk } =
      yield* observeCanonicalExtensionCapturing({
        layout,
        desired,
        accepted: Option.getOrUndefined(accepted),
        ...(verifiedTree === undefined ? {} : { verifiedTree }),
        ...(judged === undefined ? {} : { judged }),
        ...(digestAcceptedTree === undefined ? {} : { digestAcceptedTree }),
        ...(retainTreeWalk === true ? { retainTreeWalk } : {}),
      });
    const observed: AcceptedCanonicalObservation = {
      desired,
      ...(Option.isSome(accepted) ? { accepted: accepted.value } : {}),
      observation,
      sharedPackage:
        observation.path !== undefined &&
        hasOtherPackageBinding({
          path: yield* Path.Path,
          layout,
          lockfile: prepared.lockfile ?? (yield* reader.lockfile),
          canonicalPath: observation.path,
          excluded: {
            type: desired.type,
            key: Option.getOrElse(acceptedRowKey(desired), () => desired.name),
          },
        }),
    };
    return {
      observed,
      manifest,
      subagentPackage,
      digests,
      treeWalk: Option.fromUndefinedOr(treeWalk),
    };
  });

/**
 * Observe like `observeDesiredCanonical`, also handing the caller the
 * manifest text the observation read, with its own decode of it, and the
 * Subagent package its payload check loaded. Neither is retained here.
 */
export const observeDesiredCanonicalCapturing = (
  desired: DesiredExtensionNode,
): Effect.Effect<
  {
    readonly observed: AcceptedCanonicalObservation;
    readonly manifest: Option.Option<CapturedManifest>;
    readonly subagentPackage: Option.Option<CapturedSubagentPackage>;
  },
  WorkspaceStateReadFailure,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader
> => observeDesiredCanonicalCapturingWith(desired);

/** Observe one desired node against the accepted resolution its type and name resolve to. */
export const observeDesiredCanonical = (
  desired: DesiredExtensionNode,
): Effect.Effect<
  AcceptedCanonicalObservation,
  WorkspaceStateReadFailure,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader
> => Effect.map(observeDesiredCanonicalCapturing(desired), (capture) => capture.observed);

/**
 * Observe like `acceptedCanonicalObservation`, also handing the caller the
 * manifest text the observation read, for that caller's own decode, and the
 * Subagent package its payload check loaded. Neither is retained here.
 */
export const acceptedCanonicalObservationCapturing = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  {
    readonly observed: Option.Option<AcceptedCanonicalObservation>;
    readonly manifest: Option.Option<CapturedManifest>;
    /** Present when a declared node was observed. */
    readonly subagentPackage?: Option.Option<CapturedSubagentPackage>;
  },
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
> =>
  Effect.map(
    acceptedCanonicalObservationDigesting(args),
    ({ observed, manifest, subagentPackage }) =>
      subagentPackage === undefined
        ? { observed, manifest }
        : { observed, manifest, subagentPackage },
  );

/**
 * Observe like `acceptedCanonicalObservationCapturing`, also handing the
 * caller the accepted tree's digests the observation made when
 * `digestAcceptedTree` asks for them.
 */
const acceptedCanonicalObservationDigesting = (
  { type, name, desired: proposed }: AcceptedCanonicalRefArgs,
  digestAcceptedTree?: (accepted: LockEntry) => boolean,
  retainTreeWalk?: boolean,
) =>
  Effect.gen(function* () {
    const desiredState = yield* DesiredStateReader;
    if (proposed !== undefined) {
      const { observed, manifest, subagentPackage, digests, treeWalk } =
        yield* observeDesiredCanonicalCapturingWith(
          proposed,
          undefined,
          digestAcceptedTree,
          retainTreeWalk,
        );
      return { observed: Option.some(observed), manifest, subagentPackage, digests, treeWalk };
    }
    const graph = yield* desiredState.graph();
    const desired = graph.nodes.find((node) => node.type === type && node.name === name);
    if (desired === undefined)
      return {
        observed: Option.none<AcceptedCanonicalObservation>(),
        manifest: Option.none<CapturedManifest>(),
        subagentPackage: undefined,
        digests: Option.none<ObservedTreeDigests>(),
        treeWalk: Option.none<CapturedTreeWalk>(),
      };
    const { observed, manifest, subagentPackage, digests, treeWalk } =
      yield* observeDesiredCanonicalCapturingWith(
        desired,
        currentGraph(desiredState, graph),
        digestAcceptedTree,
        retainTreeWalk,
      );
    return { observed: Option.some(observed), manifest, subagentPackage, digests, treeWalk };
  });

/**
 * Observe like `acceptedCanonicalObservation`, also handing the caller the
 * strict walk the observation made of the accepted tree when it ends usable,
 * for that caller's one further digest of the same tree in the same read
 * phase. The walk is never retained here or on the observation.
 */
export const acceptedCanonicalObservationWalking = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  {
    readonly observed: Option.Option<AcceptedCanonicalObservation>;
    readonly treeWalk: Option.Option<CapturedTreeWalk>;
  },
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
> =>
  Effect.map(
    acceptedCanonicalObservationDigesting(args, undefined, true),
    ({ observed, treeWalk }) => ({ observed, treeWalk }),
  );

export const acceptedCanonicalObservation = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<AcceptedCanonicalObservation>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
> => Effect.map(acceptedCanonicalObservationCapturing(args), (capture) => capture.observed);

/**
 * The node `args` names, its accepted row, and the canonical root an
 * observation of it reports, derived from that row and the layout alone: no
 * canonical content is read.
 */
const acceptedCanonicalSubject = ({ type, name, desired: proposed }: AcceptedCanonicalRefArgs) =>
  Effect.gen(function* () {
    const desiredState = yield* DesiredStateReader;
    const graph = proposed === undefined ? yield* desiredState.graph() : undefined;
    const desired =
      proposed ?? graph?.nodes.find((node) => node.type === type && node.name === name);
    if (desired === undefined) return Option.none();
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const { accepted, lockfile } = yield* acceptedEntryOf(
      desired,
      graph === undefined ? undefined : currentGraph(desiredState, graph),
    );
    const judged = judgeCanonicalBeforeContent(
      yield* Path.Path,
      layout,
      desired,
      Option.getOrUndefined(accepted),
    );
    return Option.some({ desired, accepted, lockfile, layout, judged, path: judged.reportedPath });
  });

/**
 * The canonical root `acceptedCanonicalObservation` would report for the
 * node, without observing it: nothing about the content is judged.
 */
export const acceptedCanonicalObservationPath = (
  args: AcceptedCanonicalRefArgs,
): Effect.Effect<
  Option.Option<string>,
  AcceptedCanonicalRefError,
  Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
> =>
  Effect.map(
    acceptedCanonicalSubject(args),
    Option.flatMap(({ path }) => Option.fromUndefinedOr(path)),
  );

/**
 * Observe like `acceptedCanonicalObservation`, only when the observation
 * reports a canonical root the caller keeps: `None` when the node is
 * undeclared, its observation reports no root, or `discarded` names that root.
 * The root is the one the observation reports. `verifiedTree` is a digest of
 * that root's tree the caller's read phase computed against the node's
 * accepted row and judges again later; it stands in for hashing the tree
 * only for that root and that row.
 */
export const acceptedCanonicalObservationOfKeptRoot = (
  args: AcceptedCanonicalRefArgs,
  discarded: (canonicalPath: string) => boolean,
  verifiedTree?: VerifiedCanonicalTree,
): Effect.Effect<
  Option.Option<{ readonly path: string; readonly observed: AcceptedCanonicalObservation }>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | LockfileReader | DesiredStateReader
> =>
  Effect.gen(function* () {
    const subject = yield* acceptedCanonicalSubject(args);
    if (Option.isNone(subject)) return Option.none();
    const { desired, accepted, lockfile, layout, judged, path } = subject.value;
    if (path === undefined || discarded(path)) return Option.none();
    // The judgement made deriving the root stands for the observation's own.
    const { observed } = yield* observeAcceptedCanonicalCapturing(desired, accepted, layout, {
      ...(verifiedTree === undefined ? {} : { verifiedTree }),
      judged,
      lockfile,
    });
    return Option.some({ path, observed });
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

const usableFrom = (
  canonical: AcceptedCanonicalObservation,
  preparedWorkspaceRef: PreparedWorkspaceRef | undefined,
  manifest: Option.Option<CapturedManifest>,
): Effect.Effect<
  Option.Option<UsableAcceptedCanonical>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const usable = asUsable(canonical);
    if (Option.isNone(usable)) return Option.none();
    const ref = yield* refForDesired(usable.value.desired, preparedWorkspaceRef, {
      root: usable.value.observation.path,
      manifest,
    });
    // A usable local acquisition is the accepted copy, even if the original
    // directory has changed or disappeared. Keep sourcePath as its identity.
    const path = yield* Path.Path;
    const retainedRef =
      ref.refType === "local"
        ? {
            ...ref,
            location: path.join(
              usable.value.observation.path,
              ref.distribution?.componentPath ?? ".",
            ),
          }
        : ref;
    return Option.some({ ...usable.value, ref: retainedRef });
  });

/**
 * The usable accepted package an observation already established, with the
 * ref it is restored from. Reading the ref does not observe the package again.
 */
export const usableAcceptedCanonicalFrom = (
  canonical: AcceptedCanonicalObservation,
  preparedWorkspaceRef?: PreparedWorkspaceRef,
): Effect.Effect<
  Option.Option<UsableAcceptedCanonical>,
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> => usableFrom(canonical, preparedWorkspaceRef, Option.none());

/**
 * Observe one desired node like `observeDesiredCanonical`, with the usable
 * accepted package that observation establishes. The resolution of a usable
 * package uses the manifest decode the observation made; nothing it read is
 * retained.
 */
export const observeDesiredUsableCanonical = (
  desired: DesiredExtensionNode,
): Effect.Effect<
  {
    readonly observed: AcceptedCanonicalObservation;
    readonly usable: Option.Option<UsableAcceptedCanonical>;
  },
  AcceptedCanonicalRefError,
  FileSystem.FileSystem | Path.Path | WorkspaceLocation | SettingsReader | LockfileReader
> =>
  Effect.gen(function* () {
    const { observed, manifest } = yield* observeDesiredCanonicalCapturing(desired);
    return { observed, usable: yield* usableFrom(observed, undefined, manifest) };
  });

export const usableAcceptedCanonical = (
  args: UsableAcceptedCanonicalArgs,
): Effect.Effect<
  Option.Option<UsableAcceptedCanonical>,
  AcceptedCanonicalRefError,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
> => Effect.map(usableAcceptedCanonicalCapturing(args), ({ usable }) => usable);

/**
 * Like `usableAcceptedCanonical`, also handing the caller what the one
 * observation it makes read: the manifest text with its own decode, and,
 * when `digestAcceptedTree` asks for them, the digests of the accepted tree
 * it walked. Neither is retained here.
 */
export const usableAcceptedCanonicalCapturing = (
  args: UsableAcceptedCanonicalArgs & {
    readonly digestAcceptedTree?: (accepted: LockEntry) => boolean;
  },
): Effect.Effect<
  {
    readonly usable: Option.Option<UsableAcceptedCanonical>;
    readonly manifest: Option.Option<CapturedManifest>;
    readonly digests: Option.Option<ObservedTreeDigests>;
  },
  AcceptedCanonicalRefError,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
> =>
  acceptedCanonicalObservationDigesting(args, args.digestAcceptedTree).pipe(
    Effect.flatMap(({ observed, manifest, digests }) =>
      Option.match(observed, {
        onNone: () =>
          Effect.succeed({ usable: Option.none<UsableAcceptedCanonical>(), manifest, digests }),
        onSome: (canonical) =>
          Effect.map(usableFrom(canonical, args.preparedWorkspaceRef, manifest), (usable) => ({
            usable,
            manifest,
            digests,
          })),
      }),
    ),
  );

export const usableAcceptedCanonicalRef = (
  args: UsableAcceptedCanonicalArgs,
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

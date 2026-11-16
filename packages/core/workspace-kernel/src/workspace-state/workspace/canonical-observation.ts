import type { HttpArtifactSnapshot } from "@agentxm/extension-model/unstable/sources/http-artifact";
import { isHttpLockEntry } from "./lock-entry.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import {
  computeMaterializedTreeDigestsMatching,
  computeMaterializedTreeIntegrity,
  computeMaterializedTreeIntegrityReading,
  type TreeIntegrity,
  type WalkedFileText,
} from "./materialized-tree.js";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  loadSubagentPackage,
  readExtensionManifestCapture,
  type DecodedSubagentPackage,
  type ExtensionManifest,
} from "@agentxm/extension-content";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  extensionPathSourceFromLockEntry,
  isRegistryLockEntry,
  lockEntryMatchesSourceLocator,
  lockEntryToSourceParams,
  type LockEntry,
} from "./lock-entry.js";
import type { DesiredConstraintContributor, DesiredExtensionNode } from "./desired-state-graph.js";
import type { WorkspaceLayout } from "./layout.js";
import { bundledSkillCanonicalRoot, computeExtensionPathsForLayout } from "./extension-paths.js";
import { McpSourceKey } from "./mcp-source-identity.js";
import { desiredPackageKey, sameSourceIdentity, desiredMcpSourceKey } from "./desired-identity.js";
import { acceptedRegistryVersionForRef } from "../desired/lockfile/accepted-registry-version.js";
import { freezeWorkspaceValue } from "../desired/freeze-value.js";
import { isPathSafe } from "@agentxm/extension-model/unstable/path-types";
import {
  normalizeVersionRequest,
  versionSatisfiesRequest,
} from "@agentxm/extension-model/unstable/version-constraints";
import { sameRegistryEndpoint } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

export type CanonicalObservationStatus =
  | "not-applicable"
  | "missing"
  | "missing-resolution"
  | "constraint-mismatch"
  | "wrong-origin"
  | "corrupt"
  | "incomplete"
  | "materialization-mismatch"
  | "usable";

export type CanonicalConstraintContributor = DesiredConstraintContributor;

interface CanonicalObservationBase {
  readonly type: ExtensionType;
  readonly name: string;
  readonly path?: string;
  readonly contentIdentity?: string;
}

export interface CanonicalConstraintMismatchObservation extends CanonicalObservationBase {
  readonly status: "constraint-mismatch";
  readonly authority: {
    readonly source: "desired-state-graph";
    readonly identity: string;
    readonly locator: string;
    readonly constraints: ReadonlyArray<CanonicalConstraintContributor>;
  };
  readonly acceptedVersion?: string;
  readonly observedVersion?: string;
}

export type CanonicalObservation =
  | CanonicalConstraintMismatchObservation
  | (CanonicalObservationBase & {
      readonly status: Exclude<CanonicalObservationStatus, "constraint-mismatch">;
    });

/**
 * The digest of the tree at `root`, computed earlier in the caller's read
 * phase against the accepted row `accepted`, for a tree that phase judges
 * again later. It stands in for hashing that tree only for that root and row.
 */
export interface VerifiedCanonicalTree {
  readonly root: string;
  readonly accepted: LockEntry;
  readonly integrity: TreeIntegrity;
}

interface ObserveCanonicalArgs {
  readonly layout: WorkspaceLayout;
  readonly desired: DesiredExtensionNode;
  readonly accepted: LockEntry | undefined;
  readonly verifiedTree?: VerifiedCanonicalTree;
  /**
   * The judgement the caller already made of the node before reading its
   * content. It stands in for judging again only when it was made with this
   * path service from these exact layout, node and accepted row values.
   */
  readonly judged?: CanonicalPreContentJudgement;
  /**
   * Asks for the digests of the accepted tree the observation walks: the
   * integrity it verified, and the package content hash of the same bytes
   * when this returns true for the accepted row. They are handed out only
   * from a walk whose integrity is the accepted one, by an observation that
   * ends usable.
   */
  readonly digestAcceptedTree?: (accepted: LockEntry) => boolean;
}

/**
 * The digests of the accepted tree at `root` an observation walked and found
 * to be the accepted row's: its integrity, and its package content hash when
 * the caller asked for one. Frozen; the bytes they were computed from are not
 * kept.
 */
export interface ObservedTreeDigests {
  readonly root: string;
  readonly accepted: LockEntry;
  readonly treeIntegrity: TreeIntegrity;
  readonly contentHash: Option.Option<SourceHash>;
}

export const canonicalPathForAcceptedExtension = (
  path: Path.Path,
  layout: WorkspaceLayout,
  desired: DesiredExtensionNode,
  accepted: LockEntry | undefined,
): string | undefined => {
  if (desired.source === undefined) return undefined;
  if (desired.identity.authority === "bundled") {
    return bundledSkillCanonicalRoot(path.join, layout, desired.name);
  }
  if (desired.identity.authority === "workspace") {
    if (layout.scope === "project")
      return path.join(layout.authoredRoot(desired.type), desired.name);
    return undefined;
  }
  if (accepted === undefined) return undefined;
  const source = extensionPathSourceFromLockEntry(accepted);
  return computeExtensionPathsForLayout(
    path.join,
    layout,
    source,
    toExtensionTypePlural(desired.type),
    accepted.identity.name,
  ).canonicalPath;
};

/** Whether a package of a type other than Subagent holds its required payload. */
const hasRequiredPayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  type: Exclude<ExtensionType, "subagent">,
): Effect.Effect<boolean> => {
  switch (type) {
    case "skill":
      return Effect.map(Effect.all([fs.exists(path.join(root, "src", "SKILL.md"))]), (exists) =>
        exists.some(Boolean),
      ).pipe(Effect.orElseSucceed(() => false));
    case "rule":
    case "hook":
    case "knowledge":
      return fs.exists(path.join(root, "src")).pipe(Effect.orElseSucceed(() => false));
    case "mcp-server":
    case "pack":
      return Effect.succeed(true);
  }
};

/** Every contributor the graph's effective constraint for the node names. */
export const desiredConstraintContributors = (
  desired: Pick<DesiredExtensionNode, "constraint">,
): ReadonlyArray<DesiredConstraintContributor> =>
  Result.isSuccess(desired.constraint)
    ? desired.constraint.success.contributors
    : desired.constraint.failure.contributors;

/**
 * Whether an accepted Registry version satisfies the node's effective
 * constraint. A conflict admits no version; an unconstrained node admits what
 * `*` admits, so an accepted prerelease needs a range that names it.
 */
const registryVersionSatisfiesDesiredConstraint = (
  desired: Pick<DesiredExtensionNode, "constraint">,
  version: string,
): boolean =>
  Result.isSuccess(desired.constraint) &&
  versionSatisfiesRequest(version, normalizeVersionRequest(desired.constraint.success.range));

/**
 * Whether authored, path, or Git content satisfies the node's effective
 * constraint by its manifest version. A conflict admits no version; an
 * unconstrained node admits every version.
 */
const contentVersionSatisfiesDesiredConstraint = (
  desired: Pick<DesiredExtensionNode, "constraint">,
  version: string | undefined,
): boolean =>
  Result.isSuccess(desired.constraint) &&
  Option.match(desired.constraint.success.range, {
    onNone: () => true,
    onSome: (range) => version !== undefined && versionSatisfiesRequest(version, range),
  });

/** Whether anything constrains the node at all. */
const isConstrained = (desired: Pick<DesiredExtensionNode, "constraint">): boolean =>
  Result.isFailure(desired.constraint) || Option.isSome(desired.constraint.success.range);

const constraintMismatchObservation = (args: {
  readonly desired: DesiredExtensionNode & { readonly source: string };
  readonly canonicalPath?: string;
  readonly acceptedVersion?: string;
  readonly observedVersion?: string;
}): CanonicalConstraintMismatchObservation => ({
  type: args.desired.type,
  name: args.desired.name,
  status: "constraint-mismatch",
  ...(args.canonicalPath === undefined ? {} : { path: args.canonicalPath }),
  authority: {
    source: "desired-state-graph",
    identity: desiredPackageKey(args.desired.identity),
    locator: args.desired.source,
    constraints: desiredConstraintContributors(args.desired),
  },
  ...(args.acceptedVersion === undefined ? {} : { acceptedVersion: args.acceptedVersion }),
  ...(args.observedVersion === undefined ? {} : { observedVersion: args.observedVersion }),
});

/** Whether the canonical tree at `root` is byte-for-byte the accepted one. */
const observedTreeMatchesAccepted = (
  root: string,
  accepted: Pick<LockEntry, "treeIntegrity">,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(
    Effect.result(computeMaterializedTreeIntegrity(root)),
    (observed) => Result.isSuccess(observed) && observed.success === accepted.treeIntegrity,
  );

/** The ref an acquisition is about to materialize, as far as reuse judges it. */
export type RequestedCanonicalRef =
  | {
      readonly refType: "registry";
      readonly owner: string;
      readonly name: string;
      readonly version: string;
      readonly publisherBindingId: string;
    }
  | {
      readonly refType: "http";
      readonly owner?: string | undefined;
      readonly name: string;
      readonly snapshot: HttpArtifactSnapshot;
    }
  | {
      readonly refType: "git-hosted" | "local";
      readonly owner?: string | undefined;
      readonly name: string;
    };

interface AcceptedCanonicalReuseArgs {
  readonly canonicalPath: string;
  readonly requested: RequestedCanonicalRef;
  readonly accepted: Option.Option<LockEntry>;
  readonly force: boolean;
}

/** The accepted row whose tree reuse may keep, judged before the tree is read. */
const reuseCandidate = (args: AcceptedCanonicalReuseArgs): Option.Option<LockEntry> => {
  if (args.force || Option.isNone(args.accepted)) return Option.none();
  const accepted = args.accepted.value;
  if (args.requested.refType === "registry") {
    if (acceptedRegistryVersionForRef(args.accepted, args.requested) !== args.requested.version) {
      return Option.none();
    }
  } else if (
    isRegistryLockEntry(accepted) ||
    accepted.identity.name !== args.requested.name ||
    (args.requested.owner !== undefined && accepted.identity.owner !== args.requested.owner)
  ) {
    return Option.none();
  }
  if (
    args.requested.refType === "http" &&
    (accepted.source.type !== "http" ||
      JSON.stringify(accepted.resolved) !== JSON.stringify(args.requested.snapshot))
  )
    return Option.none();
  return Option.some(accepted);
};

/**
 * Whether an acquisition may keep the accepted canonical tree instead of
 * materializing the requested ref again. This is the only place that
 * decision is made: the tree is reused exactly when the accepted resolution
 * names the requested ref (for a Registry ref, the same identity, publisher
 * binding, and exact version) and the tree on disk is still the accepted
 * one. Edited, partial, or absent trees are re-acquired, so drift never
 * becomes accepted authority; `force` is the one bypass and always
 * re-materializes.
 */
export const observeAcceptedCanonicalReuse = (
  args: AcceptedCanonicalReuseArgs,
): Effect.Effect<Option.Option<TreeIntegrity>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const candidate = reuseCandidate(args);
    if (Option.isNone(candidate)) return Option.none();
    const accepted = candidate.value;
    return (yield* observedTreeMatchesAccepted(args.canonicalPath, accepted))
      ? Option.some(accepted.treeIntegrity)
      : Option.none();
  });

/** A tree reuse kept, with the text of the files its integrity walk read. */
export interface ReusedCanonicalTree {
  readonly treeIntegrity: TreeIntegrity;
  readonly read: WalkedFileText;
}

/**
 * Decide reuse exactly as `observeAcceptedCanonicalReuse` does, also keeping
 * the text of the regular files the integrity walk read at exactly the
 * `readPaths`. The text is handed out only with a kept tree, whose walk
 * matched the accepted integrity.
 */
export const observeAcceptedCanonicalReuseReading = (
  args: AcceptedCanonicalReuseArgs,
  readPaths: ReadonlyArray<string>,
): Effect.Effect<Option.Option<ReusedCanonicalTree>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const candidate = reuseCandidate(args);
    if (Option.isNone(candidate)) return Option.none();
    const accepted = candidate.value;
    const walked = yield* Effect.result(
      computeMaterializedTreeIntegrityReading(args.canonicalPath, readPaths),
    );
    return Result.isSuccess(walked) && walked.success.integrity === accepted.treeIntegrity
      ? Option.some<ReusedCanonicalTree>(
          Object.freeze({ treeIntegrity: accepted.treeIntegrity, read: walked.success.read }),
        )
      : Option.none();
  });

const acceptedOriginMatches = (
  desired: DesiredExtensionNode & { readonly source: string },
  accepted: LockEntry,
  path: Path.Path | undefined,
): boolean => {
  const inheritedAuthorities = desired.origins.flatMap((origin) =>
    origin.type === "pack" && origin.sourceAuthority !== undefined ? [origin.sourceAuthority] : [],
  );
  if (inheritedAuthorities.length > 0) {
    const acceptedFqn = `${accepted.identity.owner}/${toExtensionTypePlural(desired.type)}/${accepted.identity.name}`;
    if (
      accepted.identity.owner === undefined ||
      acceptedFqn !== desiredPackageKey(desired.identity)
    )
      return false;
    return inheritedAuthorities.every((authority) => {
      switch (authority.authority) {
        case "http":
          return accepted.source.type === "http" && accepted.source.url.href === authority.url.href;
        case "workspace":
          // An authored Pack supplies the member declaration, while its
          // Registry binding supplies the acquisition authority.
          return (
            desired.identity.authority === "registry" &&
            desired.identity.registry.endpoint !== undefined &&
            accepted.source.type === "registry" &&
            sameRegistryEndpoint(accepted.source.url, desired.identity.registry.endpoint)
          );
        case "registry":
          return (
            accepted.source.type === "registry" &&
            sameRegistryEndpoint(accepted.source.url, authority.endpoint)
          );
        case "path":
          return (
            accepted.source.type === "path" &&
            path !== undefined &&
            isPathSafe(path, authority.root, accepted.source.path)
          );
        case "git":
          return (
            accepted.source.type === "git" &&
            accepted.source.url.href === authority.url.href &&
            (accepted.source.revision ?? "HEAD") === authority.revision &&
            path !== undefined &&
            isPathSafe(
              path,
              Option.getOrElse(authority.root, () => "."),
              accepted.source.path ?? ".",
            )
          );
      }
    });
  }
  // A Registry row comes from the desired authority exactly when it is the
  // same package at the same canonical endpoint.
  if (desired.identity.authority === "registry")
    return (
      accepted.source.type === "registry" &&
      accepted.identity.owner !== undefined &&
      sameSourceIdentity(desired.identity, {
        authority: "registry",
        fqn: `${accepted.identity.owner}/${toExtensionTypePlural(desired.type)}/${accepted.identity.name}`,
        registry: { sourceName: undefined, endpoint: accepted.source.url },
      })
    );
  const acceptedIdentity =
    desired.type === "mcp-server" && !isHttpLockEntry(accepted)
      ? McpSourceKey.fromLockEntry(accepted)
      : printSourceParams(lockEntryToSourceParams(accepted));
  return (
    Option.exists(desiredMcpSourceKey(desired.identity), (key) => key === acceptedIdentity) ||
    acceptedIdentity === desiredPackageKey(desired.identity) ||
    acceptedIdentity === desired.source ||
    lockEntryMatchesSourceLocator(accepted, desired.source)
  );
};

/**
 * Judge the accepted resolution for a desired node before any content is
 * read: whether a node needs one, whether one is recorded, whether it names
 * the desired origin, and whether its Registry version satisfies every desired
 * constraint. Inherited path/git member authority also requires `path` to
 * establish containment beneath the declared source view. `none` means that
 * authority stands and the canonical content decides the rest of the
 * observation. Content without a Registry version is judged by its manifest
 * after the accepted tree has been checked. Activation is
 * not an input: a disabled node is judged exactly like an enabled one.
 */
export const observeAcceptedResolution = (
  desired: DesiredExtensionNode,
  accepted: LockEntry | undefined,
  path?: Path.Path,
): Option.Option<CanonicalObservation> => {
  if (desired.source === undefined) {
    return Option.some({ type: desired.type, name: desired.name, status: "not-applicable" });
  }
  if (desired.identity.authority === "workspace") return Option.none();
  const bundled = desired.identity.authority === "bundled";
  if (!bundled && accepted === undefined) {
    return Option.some({ type: desired.type, name: desired.name, status: "missing-resolution" });
  }
  if (!bundled && accepted !== undefined && !acceptedOriginMatches(desired, accepted, path)) {
    return Option.some({ type: desired.type, name: desired.name, status: "wrong-origin" });
  }
  // An accepted Registry version is always judged, an absent range standing
  // for `*`; other content is judged by its manifest once it is read.
  if (
    accepted !== undefined && isRegistryLockEntry(accepted)
      ? !registryVersionSatisfiesDesiredConstraint(desired, accepted.resolved.version)
      : Result.isFailure(desired.constraint)
  ) {
    return Option.some(
      constraintMismatchObservation({
        desired,
        ...(accepted !== undefined && isRegistryLockEntry(accepted)
          ? { acceptedVersion: accepted.resolved.version }
          : {}),
      }),
    );
  }
  return Option.none();
};

/** The authored manifest text exactly as an observation read it. */
export interface CapturedManifest {
  readonly path: string;
  readonly text: string;
  /**
   * The observation's own decode of that text with the desired type's manifest
   * grammar, present only when the decode succeeded. Its `type` is the type it
   * was decoded as. The decode is deep-frozen when first requested, so a
   * caller that only needs the text does no work for it; it belongs to the
   * caller that observed.
   */
  readonly decode: () => Option.Option<ExtensionManifest>;
}

const isManifestOfType = <T extends ExtensionType>(
  manifest: ExtensionManifest,
  type: T,
): manifest is Extract<ExtensionManifest, { readonly type: T }> => manifest.type === type;

/**
 * The captured decode exactly when it is the manifest of `type` that
 * `directory` holds; otherwise `None`, and the caller reads it itself.
 */
export const capturedManifestFor = <T extends ExtensionType>(
  path: Path.Path,
  captured: Option.Option<CapturedManifest> | undefined,
  directory: string,
  type: T,
): Option.Option<Extract<ExtensionManifest, { readonly type: T }>> =>
  Option.flatMap(Option.flatten(Option.fromUndefinedOr(captured)), (manifest) =>
    manifest.path === path.join(directory, manifestFilenameForType(type))
      ? Option.filter(manifest.decode(), (value) => isManifestOfType(value, type))
      : Option.none(),
  );

/** The Subagent package an observation's payload check loaded at `root`. */
export interface CapturedSubagentPackage {
  readonly root: string;
  /**
   * The contained load's package, or `None` when that load failed. It is
   * deep-frozen when first requested and belongs to the caller that observed.
   */
  readonly loaded: () => Option.Option<DecodedSubagentPackage>;
}

interface CanonicalObservationCapture {
  readonly observation: CanonicalObservation;
  /** Present whenever the observation read the authored manifest's text. */
  readonly manifest: Option.Option<CapturedManifest>;
  /** Present whenever the observation loaded a Subagent package to check its payload. */
  readonly subagentPackage: Option.Option<CapturedSubagentPackage>;
  /** Present when the caller asked for them and the observation ended usable. */
  readonly digests: Option.Option<ObservedTreeDigests>;
}

const uncaptured = (observation: CanonicalObservation): CanonicalObservationCapture => ({
  observation,
  manifest: Option.none(),
  subagentPackage: Option.none(),
  digests: Option.none(),
});

/**
 * What an observation of the desired node settles before it reads any
 * canonical content: either a settled observation, or the canonical root the
 * content is then read from. A pure function of the node, the accepted row
 * and the layout.
 */
const judgeBeforeContent = (
  path: Path.Path,
  layout: WorkspaceLayout,
  desired: DesiredExtensionNode,
  accepted: LockEntry | undefined,
):
  | { readonly settled: CanonicalObservation }
  | {
      readonly settled?: undefined;
      readonly root: string;
      readonly desired: DesiredExtensionNode & { readonly source: string };
    } => {
  if (desired.source === undefined) {
    return { settled: { type: desired.type, name: desired.name, status: "not-applicable" } };
  }
  const judged = observeAcceptedResolution(desired, accepted, path);
  const root = canonicalPathForAcceptedExtension(path, layout, desired, accepted);
  if (Option.isSome(judged)) {
    return {
      settled:
        judged.value.status === "constraint-mismatch" && root !== undefined
          ? { ...judged.value, path: root }
          : judged.value,
    };
  }
  if (root === undefined) {
    return { settled: { type: desired.type, name: desired.name, status: "wrong-origin" } };
  }
  return { root, desired };
};

/**
 * What an observation of the desired node settles before it reads canonical
 * content, with the inputs it was judged from and the `path` the observation
 * reports: every observation that reads content reports the canonical root it
 * read.
 */
export const judgeCanonicalBeforeContent = (
  path: Path.Path,
  layout: WorkspaceLayout,
  desired: DesiredExtensionNode,
  accepted: LockEntry | undefined,
) => {
  const judged = judgeBeforeContent(path, layout, desired, accepted);
  return {
    path,
    layout,
    desired,
    accepted,
    judged,
    reportedPath: judged.settled === undefined ? judged.root : judged.settled.path,
  };
};

type CanonicalPreContentJudgement = ReturnType<typeof judgeCanonicalBeforeContent>;

/**
 * The `path` an observation of the desired node reports, derived without
 * reading canonical content.
 */
export const observedCanonicalPath = (
  path: Path.Path,
  layout: WorkspaceLayout,
  desired: DesiredExtensionNode,
  accepted: LockEntry | undefined,
): string | undefined => judgeCanonicalBeforeContent(path, layout, desired, accepted).reportedPath;

/**
 * Observe like `observeCanonicalExtension`, also handing the caller the
 * manifest text the observation read. The text is never retained here.
 */
export const observeCanonicalExtensionCapturing = ({
  layout,
  desired: observed,
  accepted,
  verifiedTree,
  judged: prejudged,
  digestAcceptedTree,
}: ObserveCanonicalArgs): Effect.Effect<
  CanonicalObservationCapture,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const treeMatchesAccepted = (root: string, entry: LockEntry) =>
      verifiedTree !== undefined && verifiedTree.root === root && verifiedTree.accepted === entry
        ? Effect.succeed(verifiedTree.integrity === entry.treeIntegrity)
        : observedTreeMatchesAccepted(root, entry);
    const judged =
      prejudged !== undefined &&
      prejudged.path === path &&
      prejudged.layout === layout &&
      prejudged.desired === observed &&
      prejudged.accepted === accepted
        ? prejudged.judged
        : judgeBeforeContent(path, layout, observed, accepted);
    if (judged.settled !== undefined) return uncaptured(judged.settled);
    const { root, desired } = judged;
    const workspaceAuthored = desired.identity.authority === "workspace";
    const bundled = desired.identity.authority === "bundled";
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return uncaptured({ type: desired.type, name: desired.name, status: "missing", path: root });
    }

    if (
      desired.type === "mcp-server" &&
      accepted !== undefined &&
      accepted.identity.owner === undefined &&
      accepted.source.type !== "registry" &&
      accepted.source.distribution?.format === "agent-plugins"
    ) {
      if (!(yield* fs.exists(path.join(root, "mcp.json")).pipe(Effect.orElseSucceed(() => false))))
        return uncaptured({
          type: desired.type,
          name: desired.name,
          status: "incomplete",
          path: root,
        });
      if (!(yield* treeMatchesAccepted(root, accepted)))
        return uncaptured({
          type: desired.type,
          name: desired.name,
          status: "materialization-mismatch",
          path: root,
        });
      return uncaptured({ type: desired.type, name: desired.name, status: "usable", path: root });
    }

    if (
      desired.type === "skill" &&
      accepted !== undefined &&
      accepted.identity.owner === undefined
    ) {
      const component =
        accepted.source.type === "registry"
          ? "."
          : (accepted.source.distribution?.componentPath ?? ".");
      const skillMdPath = path.join(root, component, "SKILL.md");
      const skillMdExists = yield* fs.exists(skillMdPath).pipe(Effect.orElseSucceed(() => false));
      if (!skillMdExists) {
        return uncaptured({
          type: desired.type,
          name: desired.name,
          status: "incomplete",
          path: root,
        });
      }

      // SKILL.md must be readable text. A strict walk that matched the
      // accepted tree and read SKILL.md at exactly this path as a regular
      // file has shown that; anything else reads it, and an unreadable
      // SKILL.md is corrupt before the tree is judged a mismatch.
      const verified =
        verifiedTree !== undefined &&
        verifiedTree.root === root &&
        verifiedTree.accepted === accepted;
      const walked = verified
        ? undefined
        : yield* Effect.result(computeMaterializedTreeIntegrityReading(root, [skillMdPath]));
      const walkedMatch =
        walked !== undefined &&
        Result.isSuccess(walked) &&
        walked.success.integrity === accepted.treeIntegrity;
      const readByWalk =
        walkedMatch &&
        Result.isSuccess(walked) &&
        Option.isSome(walked.success.read.text(skillMdPath));
      if (!readByWalk) {
        const raw = yield* fs.readFileString(skillMdPath).pipe(Effect.result);
        if (Result.isFailure(raw)) {
          return uncaptured({
            type: desired.type,
            name: desired.name,
            status: "corrupt",
            path: root,
          });
        }
      }
      if (walked === undefined ? !(yield* treeMatchesAccepted(root, accepted)) : !walkedMatch) {
        return uncaptured({
          type: desired.type,
          name: desired.name,
          status: "materialization-mismatch",
          path: root,
        });
      }

      if (isConstrained(desired) && !contentVersionSatisfiesDesiredConstraint(desired, undefined)) {
        return uncaptured(constraintMismatchObservation({ desired, canonicalPath: root }));
      }

      return uncaptured({
        type: desired.type,
        name: desired.name,
        status: "usable",
        path: root,
      });
    }

    const capture = yield* readExtensionManifestCapture(root, desired.type);
    const captured = (
      observation: CanonicalObservation,
      subagentPackage: Option.Option<CapturedSubagentPackage> = Option.none(),
      digests: Option.Option<ObservedTreeDigests> = Option.none(),
    ): CanonicalObservationCapture => ({
      observation,
      manifest: Option.map(capture.text, (text) => ({
        path: path.join(root, manifestFilenameForType(desired.type)),
        text,
        decode: () =>
          Option.map(Result.getSuccess(capture.result), ({ manifest }) =>
            freezeWorkspaceValue(manifest),
          ),
      })),
      subagentPackage,
      digests,
    });
    const read = capture.result;
    if (Result.isFailure(read)) {
      return captured({
        type: desired.type,
        name: desired.name,
        status: read.failure.code === "manifest_missing" ? "incomplete" : "corrupt",
        path: root,
      });
    }
    const parsed = read.success.raw;
    const expectedOwner = bundled
      ? "@agentxm"
      : workspaceAuthored
        ? layout.owner
        : accepted?.identity.owner;
    const expectedName = bundled || workspaceAuthored ? desired.name : accepted?.identity.name;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("owner" in parsed) ||
      parsed.owner !== expectedOwner ||
      !("name" in parsed) ||
      parsed.name !== expectedName ||
      !("type" in parsed) ||
      parsed.type !== desired.type
    ) {
      return captured({
        type: desired.type,
        name: desired.name,
        status: "wrong-origin",
        path: root,
      });
    }
    const manifestVersion =
      "version" in parsed && typeof parsed.version === "string" ? parsed.version : undefined;

    // A Subagent's payload is complete exactly when its package loads through
    // the contained loader; the caller receives that load.
    const { payloadComplete, subagentPackage } =
      desired.type === "subagent"
        ? yield* Effect.map(loadSubagentPackage(root).pipe(Effect.option), (loaded) => ({
            payloadComplete: Option.isSome(loaded),
            subagentPackage: Option.some<CapturedSubagentPackage>({
              root,
              loaded: () => Option.map(loaded, (pkg) => freezeWorkspaceValue(pkg)),
            }),
          }))
        : {
            payloadComplete: yield* hasRequiredPayload(fs, path, root, desired.type).pipe(
              Effect.orElseSucceed(() => false),
            ),
            subagentPackage: Option.none<CapturedSubagentPackage>(),
          };
    if (!payloadComplete) {
      return captured(
        { type: desired.type, name: desired.name, status: "incomplete", path: root },
        subagentPackage,
      );
    }

    // A caller that asked for the accepted tree's digests receives them from
    // this same walk, unless a digest the caller verified stands for it.
    const digested =
      !workspaceAuthored &&
      accepted !== undefined &&
      digestAcceptedTree !== undefined &&
      !(
        verifiedTree !== undefined &&
        verifiedTree.root === root &&
        verifiedTree.accepted === accepted
      )
        ? yield* Effect.map(
            Effect.result(
              computeMaterializedTreeDigestsMatching(
                root,
                accepted.treeIntegrity,
                digestAcceptedTree(accepted),
              ),
            ),
            (walked) =>
              Result.isSuccess(walked) && walked.success.treeIntegrity === accepted.treeIntegrity
                ? Option.some<ObservedTreeDigests>(
                    Object.freeze({ root, accepted, ...walked.success }),
                  )
                : Option.none<ObservedTreeDigests>(),
          )
        : undefined;
    if (
      !workspaceAuthored &&
      accepted !== undefined &&
      !(digested === undefined
        ? yield* treeMatchesAccepted(root, accepted)
        : Option.isSome(digested))
    ) {
      return captured(
        {
          type: desired.type,
          name: desired.name,
          status: "materialization-mismatch",
          path: root,
        },
        subagentPackage,
      );
    }

    // Authored and path/git content have no accepted Registry version:
    // their inspected manifest is what the desired constraints judge.
    if (
      (accepted === undefined || !isRegistryLockEntry(accepted)) &&
      isConstrained(desired) &&
      !contentVersionSatisfiesDesiredConstraint(desired, manifestVersion)
    ) {
      return captured(
        constraintMismatchObservation({
          desired,
          canonicalPath: root,
          ...(manifestVersion === undefined ? {} : { observedVersion: manifestVersion }),
        }),
        subagentPackage,
      );
    }

    return captured(
      {
        type: desired.type,
        name: desired.name,
        status: "usable",
        path: root,
      },
      subagentPackage,
      digested ?? Option.none(),
    );
  });

export const observeCanonicalExtension = (
  args: ObserveCanonicalArgs,
): Effect.Effect<CanonicalObservation, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(observeCanonicalExtensionCapturing(args), (capture) => capture.observation);

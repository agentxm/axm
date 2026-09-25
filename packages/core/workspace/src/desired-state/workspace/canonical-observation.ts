import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as semver from "semver";
import { computeMaterializedTreeIntegrity } from "./materialized-tree.js";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { parseSkillMd, readExtensionManifest } from "@agentxm/extension-content";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  lockEntryMatchesSourceLocator,
  lockEntryToSourceParams,
} from "./lock-entry-to-source-params.js";
import type { DesiredConstraintContributor, DesiredExtensionNode } from "./desired-state-graph.js";
import type { WorkspaceLayout } from "./layout.js";
import {
  bundledSkillCanonicalRoot,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
} from "./extension-paths.js";
import { mcpResolutionKey } from "./mcp-source-identity.js";
import { desiredMcpSourceKey, desiredPackageKey } from "./desired-identity.js";
import { acceptedRegistryVersionForRef } from "../lockfile/accepted-registry-version.js";
import type { TreeIntegrity } from "./materialized-tree.js";

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

interface ObserveCanonicalArgs {
  readonly layout: WorkspaceLayout;
  readonly desired: DesiredExtensionNode;
  readonly accepted: AcceptedExtensionResolution | undefined;
}

export type AcceptedExtensionResolution =
  | SkillLockEntry
  | McpServerLockEntry
  | SubagentLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry
  | PackLockEntry;

const isRegistryResolution = (
  entry: AcceptedExtensionResolution,
): entry is Extract<
  AcceptedExtensionResolution,
  { readonly source: { readonly type: "registry" } }
> => entry.source.type === "registry";

export const canonicalPathForAcceptedExtension = (
  path: Path.Path,
  layout: WorkspaceLayout,
  desired: DesiredExtensionNode,
  accepted: AcceptedExtensionResolution | undefined,
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

const hasRequiredPayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  type: ExtensionType,
  name: string,
) => {
  switch (type) {
    case "skill":
      return Effect.map(Effect.all([fs.exists(path.join(root, "src", "SKILL.md"))]), (exists) =>
        exists.some(Boolean),
      );
    case "subagent":
      return fs.exists(path.join(root, "src", `${name}.md`));
    case "rule":
    case "hook":
    case "knowledge":
      return fs.exists(path.join(root, "src"));
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
 * Whether a version satisfies the node's effective constraint. A conflict
 * admits no version; an unconstrained node admits every version.
 */
const satisfiesDesiredConstraint = (
  desired: Pick<DesiredExtensionNode, "constraint">,
  version: string | undefined,
): boolean =>
  Result.isSuccess(desired.constraint) &&
  Option.match(desired.constraint.success.range, {
    onNone: () => true,
    onSome: (range) => version !== undefined && semver.satisfies(version, range),
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
  accepted: Pick<AcceptedExtensionResolution, "treeIntegrity">,
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
      readonly refType: "git-hosted" | "local";
      readonly owner?: string | undefined;
      readonly name: string;
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
export const observeAcceptedCanonicalReuse = (args: {
  readonly canonicalPath: string;
  readonly requested: RequestedCanonicalRef;
  readonly accepted: Option.Option<AcceptedExtensionResolution>;
  readonly force: boolean;
}): Effect.Effect<Option.Option<TreeIntegrity>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (args.force || Option.isNone(args.accepted)) return Option.none();
    const accepted = args.accepted.value;
    if (args.requested.refType === "registry") {
      if (acceptedRegistryVersionForRef(args.accepted, args.requested) !== args.requested.version) {
        return Option.none();
      }
    } else if (
      isRegistryResolution(accepted) ||
      accepted.identity.name !== args.requested.name ||
      (args.requested.owner !== undefined && accepted.identity.owner !== args.requested.owner)
    ) {
      return Option.none();
    }
    return (yield* observedTreeMatchesAccepted(args.canonicalPath, accepted))
      ? Option.some(accepted.treeIntegrity)
      : Option.none();
  });

const acceptedOriginMatches = (
  desired: DesiredExtensionNode & { readonly source: string },
  accepted: AcceptedExtensionResolution,
): boolean => {
  const acceptedIdentity =
    desired.type === "mcp-server"
      ? mcpResolutionKey(accepted)
      : isRegistryResolution(accepted)
        ? `${accepted.identity.owner}/${toExtensionTypePlural(desired.type)}/${accepted.identity.name}`
        : printSourceParams(lockEntryToSourceParams(accepted));
  return (
    acceptedIdentity === desiredMcpSourceKey(desired.identity) ||
    acceptedIdentity === desiredPackageKey(desired.identity) ||
    acceptedIdentity === desired.source ||
    lockEntryMatchesSourceLocator(accepted, desired.source)
  );
};

/**
 * Judge the accepted resolution for a desired node before any content is
 * read: whether a node needs one, whether one is recorded, whether it names
 * the desired origin, and whether its version satisfies every desired
 * constraint. `none` means that authority stands and the canonical content
 * decides the rest of the observation. Workspace-authored content has no
 * accepted resolution; its manifest is judged with the content. Activation is
 * not an input: a disabled node is judged exactly like an enabled one.
 */
export const observeAcceptedResolution = (
  desired: DesiredExtensionNode,
  accepted: AcceptedExtensionResolution | undefined,
): Option.Option<CanonicalObservation> => {
  if (desired.source === undefined) {
    return Option.some({ type: desired.type, name: desired.name, status: "not-applicable" });
  }
  if (desired.identity.authority === "workspace") return Option.none();
  const bundled = desired.identity.authority === "bundled";
  if (!bundled && accepted === undefined) {
    return Option.some({ type: desired.type, name: desired.name, status: "missing-resolution" });
  }
  if (!bundled && accepted !== undefined && !acceptedOriginMatches(desired, accepted)) {
    return Option.some({ type: desired.type, name: desired.name, status: "wrong-origin" });
  }
  if (
    isConstrained(desired) &&
    !(
      accepted !== undefined &&
      isRegistryResolution(accepted) &&
      satisfiesDesiredConstraint(desired, accepted.resolved.version)
    )
  ) {
    return Option.some(
      constraintMismatchObservation({
        desired,
        ...(accepted !== undefined && isRegistryResolution(accepted)
          ? { acceptedVersion: accepted.resolved.version }
          : {}),
      }),
    );
  }
  return Option.none();
};

export const observeCanonicalExtension = ({
  layout,
  desired,
  accepted,
}: ObserveCanonicalArgs): Effect.Effect<
  CanonicalObservation,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (desired.source === undefined) {
      return { type: desired.type, name: desired.name, status: "not-applicable" };
    }
    const judged = observeAcceptedResolution(desired, accepted);
    const root = canonicalPathForAcceptedExtension(path, layout, desired, accepted);
    if (Option.isSome(judged)) {
      return judged.value.status === "constraint-mismatch" && root !== undefined
        ? { ...judged.value, path: root }
        : judged.value;
    }
    const workspaceAuthored = desired.identity.authority === "workspace";
    const bundled = desired.identity.authority === "bundled";
    if (root === undefined) {
      return { type: desired.type, name: desired.name, status: "wrong-origin" };
    }
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return { type: desired.type, name: desired.name, status: "missing", path: root };
    }

    if (
      desired.type === "skill" &&
      accepted !== undefined &&
      accepted.identity.owner === undefined
    ) {
      const skillMdPath = path.join(root, "SKILL.md");
      const skillMdExists = yield* fs.exists(skillMdPath).pipe(Effect.orElseSucceed(() => false));
      if (!skillMdExists) {
        return { type: desired.type, name: desired.name, status: "incomplete", path: root };
      }

      const raw = yield* fs.readFileString(skillMdPath).pipe(Effect.result);
      if (Result.isFailure(raw)) {
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }
      if (Option.isNone(parseSkillMd(raw.success, accepted.identity.name))) {
        return { type: desired.type, name: desired.name, status: "corrupt", path: root };
      }

      if (!(yield* observedTreeMatchesAccepted(root, accepted))) {
        return {
          type: desired.type,
          name: desired.name,
          status: "materialization-mismatch",
          path: root,
        };
      }

      return {
        type: desired.type,
        name: desired.name,
        status: "usable",
        path: root,
      };
    }

    const read = yield* readExtensionManifest(root, desired.type).pipe(Effect.result);
    if (Result.isFailure(read)) {
      return {
        type: desired.type,
        name: desired.name,
        status: read.failure.code === "manifest_missing" ? "incomplete" : "corrupt",
        path: root,
      };
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
      return { type: desired.type, name: desired.name, status: "wrong-origin", path: root };
    }
    const manifestVersion =
      "version" in parsed && typeof parsed.version === "string" ? parsed.version : undefined;

    // Authored content has no accepted version: its manifest is what the
    // desired constraints judge.
    if (
      workspaceAuthored &&
      isConstrained(desired) &&
      !satisfiesDesiredConstraint(desired, manifestVersion)
    ) {
      return constraintMismatchObservation({
        desired,
        canonicalPath: root,
        ...(manifestVersion === undefined ? {} : { observedVersion: manifestVersion }),
      });
    }

    const payloadComplete = yield* hasRequiredPayload(
      fs,
      path,
      root,
      desired.type,
      desired.name,
    ).pipe(Effect.orElseSucceed(() => false));
    if (!payloadComplete) {
      return { type: desired.type, name: desired.name, status: "incomplete", path: root };
    }

    if (
      !workspaceAuthored &&
      accepted !== undefined &&
      !(yield* observedTreeMatchesAccepted(root, accepted))
    ) {
      return {
        type: desired.type,
        name: desired.name,
        status: "materialization-mismatch",
        path: root,
      };
    }

    return {
      type: desired.type,
      name: desired.name,
      status: "usable",
      path: root,
    };
  });

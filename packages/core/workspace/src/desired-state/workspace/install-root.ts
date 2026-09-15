/**
 * Install-root inventory.
 *
 * Classifies every entry in a scope's install root (`agent_extensions`): an
 * installed package whose path gives a well-formed extension identity or is
 * proven by an accepted resolution, AXM's own interrupted staging, or an
 * unrecognized entry. Each installed package records whether desired state
 * still reaches it; one that nothing reaches is a leftover.
 *
 * Location inside the install root is AXM's install proof for canonical
 * package directories only. It never proves ownership of agent projections.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  extensionTypes,
  isExtensionTypePlural,
  toExtensionType,
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";

import type { DesiredStateGraph } from "./desired-state-graph.js";
import { sanitizeName } from "./extension-name.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
} from "./extension-paths.js";
import type { WorkspaceLayout } from "./layout.js";
import type { LockfileReaderService } from "./lockfile-reader.js";

/** An installed package directory in the install root. */
export interface InstalledPackageEntry {
  readonly kind: "package";
  readonly type: ExtensionType;
  readonly name: string;
  /** The owner handle the path names, when the path gives one. */
  readonly owner: string | undefined;
  /** The source directory the package sits under, when the path gives one. */
  readonly sourceDirectory: string | undefined;
  /** Absolute canonical package path. */
  readonly path: string;
  /** The lock key of the accepted resolution whose canonical path this is. */
  readonly lockKey: string | undefined;
  /** Whether any desired route reaches this canonical package. */
  readonly reached: boolean;
}

/** An install-root entry that is neither an installed package nor AXM staging. */
export interface UnrecognizedInstallRootEntry {
  readonly kind: "unrecognized";
  readonly path: string;
  readonly entryKind: "file" | "directory" | "symlink";
}

export type InstallRootEntry = InstalledPackageEntry | UnrecognizedInstallRootEntry;

export interface InstallRootInventory {
  readonly root: string;
  readonly packages: ReadonlyArray<InstalledPackageEntry>;
  readonly leftovers: ReadonlyArray<InstalledPackageEntry>;
  readonly unrecognized: ReadonlyArray<UnrecognizedInstallRootEntry>;
}

/** AXM's own interrupted replacement directories beside a canonical package. */
export const isInstallRootStagingName = (name: string): boolean =>
  name.endsWith(".axm-staging") || name.endsWith(".axm-backup");

const PLATFORM_METADATA_FILES: ReadonlySet<string> = new Set([".DS_Store", "Thumbs.db"]);

const isCanonicalName = (name: string) => sanitizeName(name) === name;
const isOwnerSegment = (segment: string) =>
  segment.startsWith("@") && segment.length > 1 && isCanonicalName(segment.slice(1));

/**
 * `<source>/@<owner>/<plural>/<name>` for acquired packages, or
 * `@<owner>/<plural>/<name>` for user-scope authored packages.
 */
const identityOf = (
  segments: ReadonlyArray<string>,
): Pick<InstalledPackageEntry, "type" | "name" | "owner" | "sourceDirectory"> | undefined => {
  const [first = "", second = "", third = "", fourth = ""] = segments;
  const shape =
    segments.length === 4 && !first.startsWith("@")
      ? { sourceDirectory: first, owner: second, plural: third, name: fourth }
      : segments.length === 3
        ? { sourceDirectory: undefined, owner: first, plural: second, name: third }
        : undefined;
  if (shape === undefined || !isOwnerSegment(shape.owner) || !isCanonicalName(shape.name))
    return undefined;
  if (!isExtensionTypePlural(shape.plural)) return undefined;
  return {
    type: toExtensionType(shape.plural),
    name: shape.name,
    owner: shape.owner,
    sourceDirectory: shape.sourceDirectory,
  };
};

/** Whether a directory can still lead to a well-formed identity path. */
const isIdentityPrefix = (segments: ReadonlyArray<string>) => {
  const [first = "", second = "", third = ""] = segments;
  switch (segments.length) {
    case 1:
      return true;
    case 2:
      return first.startsWith("@")
        ? isOwnerSegment(first) && isExtensionTypePlural(second)
        : isOwnerSegment(second);
    case 3:
      return !first.startsWith("@") && isExtensionTypePlural(third);
    default:
      return false;
  }
};

export interface ObserveInstallRootArgs {
  readonly layout: WorkspaceLayout;
  readonly graph: DesiredStateGraph;
  readonly locks: LockfileReaderService;
}

/**
 * Observe the install root. When desired state is incomplete, every installed
 * package counts as reached: no leftover is claimed without full reachability.
 */
export const observeInstallRoot = ({ layout, graph, locks }: ObserveInstallRootArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = layout.acquiredRoot;

    const accepted = (yield* Effect.forEach(extensionTypes, (type) =>
      locks
        .entries(type)
        .pipe(
          Effect.map((entries) =>
            Object.entries(entries).map(([key, entry]) => ({ type, key, entry })),
          ),
        ),
    )).flat();
    const nodeReaches = (type: ExtensionType, key: string) =>
      graph.nodes.some(
        (node) =>
          node.type === type && (type === "mcp-server" ? node.identity === key : node.name === key),
      );
    const lockedPaths = new Map<string, (typeof accepted)[number] & { readonly reached: boolean }>(
      accepted.map((row) => [
        computeExtensionPathsForLayout(
          path.join,
          layout,
          extensionPathSourceFromLockEntry(row.entry),
          toExtensionTypePlural(row.type),
          row.entry.workspaceName,
        ).canonicalPath,
        { ...row, reached: nodeReaches(row.type, row.key) },
      ]),
    );
    // A desired extension whose resolution is not yet accepted may still be
    // materialized into this path, so it reaches every same-named package.
    const unlockedDesired = graph.nodes.filter(
      (node) =>
        !accepted.some(
          (row) =>
            row.type === node.type &&
            (node.type === "mcp-server" ? row.key === node.identity : row.key === node.name),
        ),
    );

    const packages: Array<InstalledPackageEntry> = [];
    const unrecognized: Array<UnrecognizedInstallRootEntry> = [];

    const isLink = (target: string) =>
      fs.readLink(target).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );

    const leadsToLockedPath = (directory: string) =>
      [...lockedPaths.keys()].some((locked) => {
        const relative = path.relative(directory, locked);
        return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
      });

    const visit = (
      directory: string,
      segments: ReadonlyArray<string>,
    ): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        const names = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []));
        for (const name of [...names].sort()) {
          const absolute = path.join(directory, name);
          const childSegments = [...segments, name];
          if (isInstallRootStagingName(name) || PLATFORM_METADATA_FILES.has(name)) continue;
          if (yield* isLink(absolute)) {
            unrecognized.push({ kind: "unrecognized", path: absolute, entryKind: "symlink" });
            continue;
          }
          const info = yield* fs.stat(absolute).pipe(Effect.option);
          if (info._tag === "None") continue;
          if (info.value.type !== "Directory") {
            unrecognized.push({ kind: "unrecognized", path: absolute, entryKind: "file" });
            continue;
          }
          const locked = lockedPaths.get(absolute);
          const identity = identityOf(childSegments);
          const type = locked?.type ?? identity?.type;
          const packageName = locked?.entry.workspaceName ?? identity?.name;
          if (type !== undefined && packageName !== undefined) {
            // A path without a source directory is authored content, which is
            // never inferred to be undesired.
            const reached =
              !graph.complete ||
              (locked === undefined && identity?.sourceDirectory === undefined) ||
              (locked?.reached ?? false) ||
              unlockedDesired.some((node) => node.type === type && node.name === packageName);
            packages.push({
              kind: "package",
              type,
              name: packageName,
              owner: identity?.owner,
              sourceDirectory: identity?.sourceDirectory,
              path: absolute,
              lockKey: locked?.key,
              reached,
            });
            continue;
          }
          if (isIdentityPrefix(childSegments) || leadsToLockedPath(absolute)) {
            yield* visit(absolute, childSegments);
            continue;
          }
          unrecognized.push({ kind: "unrecognized", path: absolute, entryKind: "directory" });
        }
      });

    if (yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false))) yield* visit(root, []);

    return {
      root,
      packages,
      leftovers: packages.filter((entry) => !entry.reached),
      unrecognized,
    } satisfies InstallRootInventory;
  });

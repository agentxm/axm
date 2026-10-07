/**
 * Install-root inventory.
 *
 * Accepted resolutions prove installed package ownership. Directory names do
 * not: unknown content is preserved, including after accepted metadata loss.
 * Native projection ownership is established independently.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { isStrictlyWithin } from "@agentxm/extension-model/unstable/path-types";
import {
  extensionTypes,
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";

import { acceptedRowKey, desiredReachesAcceptedRow } from "./accepted-reachability.js";
import { lockEntries } from "./entry-accessors.js";
import { isInstallRootStagingName } from "./constants.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import { unresolvedPackRoutes } from "./desired-state-queries.js";
import { bundledSkillCanonicalRoot, computeExtensionPathsForLayout } from "./extension-paths.js";
import { extensionPathSourceFromLockEntry } from "./lock-entry.js";
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

const PLATFORM_METADATA_FILES: ReadonlySet<string> = new Set([".DS_Store", "Thumbs.db"]);

export interface ObserveInstallRootArgs {
  readonly layout: WorkspaceLayout;
  readonly graph: DesiredStateGraph;
  readonly locks: Pick<LockfileReaderService, "lockfile">;
}

/**
 * Observe the install root. While any active Pack's routes are unresolved,
 * every installed package counts as reached: no leftover is claimed without
 * the evidence that no desired route reaches it.
 */
export const observeInstallRoot = ({ layout, graph, locks }: ObserveInstallRootArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = layout.acquiredRoot;

    // One accepted-resolution observation supplies every type in this inventory.
    // A later invocation reads again, including when called after a mutation.
    const lockfile = yield* locks.lockfile;
    const accepted = extensionTypes.flatMap((type) =>
      Object.entries(lockEntries[type].entries(lockfile)).map(([key, entry]) => ({
        type,
        key,
        entry,
      })),
    );
    const bundledPaths = new Set(
      graph.nodes.flatMap((node) =>
        node.type === "skill" && node.identity.authority === "bundled"
          ? [bundledSkillCanonicalRoot(path.join, layout, node.name)]
          : [],
      ),
    );
    const lockedPaths = new Map<string, Array<(typeof accepted)[number]>>();
    for (const row of accepted) {
      const canonicalPath = computeExtensionPathsForLayout(
        path.join,
        layout,
        extensionPathSourceFromLockEntry(row.entry),
        toExtensionTypePlural(row.type),
        row.entry.identity.name,
      ).canonicalPath;
      const bindings = lockedPaths.get(canonicalPath);
      if (bindings === undefined) lockedPaths.set(canonicalPath, [row]);
      else bindings.push(row);
    }
    // A desired extension whose resolution is not yet accepted may still be
    // materialized into this path, so it reaches every same-named package.
    const routesUnresolved = unresolvedPackRoutes(graph).length > 0;
    const unlockedDesired = graph.nodes.filter((node) =>
      Option.match(acceptedRowKey(node), {
        onNone: () => true,
        onSome: (key) => !accepted.some((row) => row.type === node.type && row.key === key),
      }),
    );

    const packages: Array<InstalledPackageEntry> = [];
    const unrecognized: Array<UnrecognizedInstallRootEntry> = [];

    const isLink = (target: string) =>
      fs.readLink(target).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );

    const leadsToLockedPath = (directory: string) =>
      [...lockedPaths.keys(), ...bundledPaths].some((locked) =>
        isStrictlyWithin(path, directory, locked),
      );

    const visit = (directory: string): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        const names = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []));
        for (const name of [...names].sort()) {
          const absolute = path.join(directory, name);
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
          if (bundledPaths.has(absolute)) continue;
          const bindings = lockedPaths.get(absolute) ?? [];
          const locked = bindings[0];
          const type = locked?.type;
          const packageName = locked?.entry.identity.name;
          if (type !== undefined && packageName !== undefined) {
            const reached =
              routesUnresolved ||
              bindings.some((row) => desiredReachesAcceptedRow(graph, row)) ||
              bindings.some((row) =>
                unlockedDesired.some(
                  (node) => node.type === row.type && node.name === row.entry.identity.name,
                ),
              );
            packages.push({
              kind: "package",
              type,
              name: packageName,
              owner: locked?.entry.identity.owner,
              sourceDirectory: path.relative(root, absolute).split(path.sep)[0],
              path: absolute,
              lockKey: locked?.key,
              reached,
            });
            continue;
          }
          if (leadsToLockedPath(absolute)) {
            yield* visit(absolute);
            continue;
          }
          unrecognized.push({ kind: "unrecognized", path: absolute, entryKind: "directory" });
        }
      });

    if (yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false))) yield* visit(root);

    return {
      root,
      packages,
      leftovers: packages.filter((entry) => !entry.reached),
      unrecognized,
    } satisfies InstallRootInventory;
  });

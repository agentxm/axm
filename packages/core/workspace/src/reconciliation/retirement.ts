import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  extensionTypes,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  AcceptedResolutionWriter,
  DesiredStateReader,
  LockfileReader,
  WorkspaceLocation,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  computeMaterializedTreeIntegrity,
  validatePathSafety,
  lockEntrySemanticallyEqual,
  observeInstallRoot,
  type DesiredStateGraph,
  type ExtensionTarget,
  type InstalledPackageEntry,
} from "../desired-state/index.js";
import { protectWorkspacePath, runWorkspaceTransaction } from "../transitions/settlement/index.js";
import type { PlannedJobStep } from "../transitions/planning/index.js";
import { WorkspaceSyncFailed } from "./errors.js";
import type { SyncFailureAdapter } from "./failure-adapter.js";
import type { SyncStepRequirements } from "./plan.js";

/** A full-graph maintenance closure; never infers intent from accepted records. */
export const collectUnreachableRetirement = (
  adapter: SyncFailureAdapter,
  scope?: {
    readonly resultingGraph: DesiredStateGraph;
    readonly subjects: ReadonlyArray<Pick<ExtensionTarget, "type" | "name">>;
  },
  observedGraph?: DesiredStateGraph,
) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const desiredState = yield* DesiredStateReader;
    const layout = yield* Ref.get(location.layout);
    const locks = yield* LockfileReader;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const graph = observedGraph ?? scope?.resultingGraph ?? (yield* desiredState.graph());
    if (!graph.complete)
      return Option.none<PlannedJobStep<SyncStepRequirements | LockfileReader>>();
    const reachable = (type: (typeof extensionTypes)[number], key: string) =>
      graph.nodes.some(
        (node) =>
          node.type === type && (type === "mcp-server" ? node.identity === key : node.name === key),
      );
    const accepted = (yield* Effect.forEach(extensionTypes, (type) =>
      locks
        .entries(type)
        .pipe(
          Effect.map((entries) =>
            Object.entries(entries).map(([key, entry]) => ({ type, key, entry })),
          ),
        ),
    )).flat();
    const scopedMcpEntries =
      scope === undefined
        ? []
        : yield* Effect.forEach(
            scope.subjects.filter((subject) => subject.type === "mcp-server"),
            (subject) =>
              locks.mcpServerForConnection(subject.name).pipe(Effect.map(Option.getOrUndefined)),
          );
    const canonicalPath = ({ type, entry }: (typeof accepted)[number]) =>
      computeExtensionPathsForLayout(
        path.join,
        layout,
        extensionPathSourceFromLockEntry(entry),
        toExtensionTypePlural(type),
        entry.identity.name,
      ).canonicalPath;
    const retainedPaths = new Set(
      accepted.filter(({ type, key }) => reachable(type, key)).map(canonicalPath),
    );
    const retired = yield* Effect.forEach(
      accepted.filter(
        ({ type, key, entry }) =>
          !reachable(type, key) &&
          (scope === undefined ||
            scope.subjects.some(
              (subject) => subject.type === type && subject.name === entry.identity.name,
            ) ||
            (type === "mcp-server" &&
              scopedMcpEntries.some((scoped) => lockEntrySemanticallyEqual(scoped, entry)))),
      ),
      (row) =>
        Effect.gen(function* () {
          const canonical = canonicalPath(row);
          yield* validatePathSafety(path, layout.acquiredRoot, canonical);
          const exists = yield* fs.exists(canonical).pipe(
            Effect.mapError(
              (cause) =>
                new WorkspaceSyncFailed({
                  category: "internal",
                  detail: `Cannot inspect ${canonical}`,
                  cause,
                }),
            ),
          );
          const shared = [...retainedPaths].some((retained) => {
            const below = path.relative(canonical, retained);
            const above = path.relative(retained, canonical);
            return (
              below === "" ||
              (!below.startsWith(`..${path.sep}`) && below !== ".." && !path.isAbsolute(below)) ||
              (!above.startsWith(`..${path.sep}`) && above !== ".." && !path.isAbsolute(above))
            );
          });
          if (exists && !shared) {
            const integrity = yield* computeMaterializedTreeIntegrity(canonical);
            if (integrity !== row.entry.treeIntegrity)
              return yield* new WorkspaceSyncFailed({
                category: "conflict",
                detail: `Cannot retire unverified acquired content at ${canonical}`,
              });
          }
          return { ...row, canonical, shared, exists, removeCanonical: exists && !shared };
        }),
    );
    if (retired.length === 0)
      return Option.none<PlannedJobStep<SyncStepRequirements | LockfileReader>>();
    const artifact = {
      path: location.scope === "project" ? "axm-lock.yaml" : ".axm/workspace/axm-lock.yaml",
      scope: location.scope,
      change: "updated" as const,
      references: retired
        .filter((row) => !row.removeCanonical)
        .map((row) => ({
          path: path.relative(location.baseDir, row.canonical),
          state: row.exists ? ("retained" as const) : ("absent" as const),
          reason: row.exists
            ? "shared acquired content remains desired"
            : "canonical content is already absent",
        })),
      targets: retired
        .filter((row) => row.removeCanonical)
        .map((row) => ({
          path: path.relative(location.baseDir, row.canonical),
          change: "removed" as const,
        })),
    };
    return Option.some<PlannedJobStep<SyncStepRequirements | LockfileReader>>({
      key: "workspace:unreachable-acquisitions",
      label: "unreachable acquired extensions",
      readiness: "ready",
      artifact,
      run: runWorkspaceTransaction({
        transition: Effect.gen(function* () {
          const current = yield* desiredState.graph();
          if (
            !current.complete ||
            retired.some(({ type, key }) =>
              current.nodes.some(
                (node) =>
                  node.type === type &&
                  (type === "mcp-server" ? node.identity === key : node.name === key),
              ),
            )
          ) {
            return yield* new WorkspaceSyncFailed({
              category: "conflict",
              detail: "Desired reachability changed before retirement",
            });
          }
          const writer = yield* AcceptedResolutionWriter;
          for (const row of retired) {
            const accepted = yield* locks.entry(row.type, row.key);
            if (Option.isNone(accepted) || !lockEntrySemanticallyEqual(accepted.value, row.entry))
              return yield* new WorkspaceSyncFailed({
                category: "conflict",
                detail: `Accepted ${row.type} ${row.key} changed before retirement`,
              });
            if (row.removeCanonical) {
              const integrity = yield* computeMaterializedTreeIntegrity(row.canonical);
              if (integrity !== row.entry.treeIntegrity)
                return yield* new WorkspaceSyncFailed({
                  category: "conflict",
                  detail: `Acquired content changed before retirement: ${row.canonical}`,
                });
              yield* protectWorkspacePath(row.canonical);
              yield* fs.remove(row.canonical, { recursive: true }).pipe(
                Effect.mapError(
                  (cause) =>
                    new WorkspaceSyncFailed({
                      category: "internal",
                      detail: `Could not retire ${row.canonical}`,
                      cause,
                    }),
                ),
              );
            }
            yield* writer.removeAccepted(row.type, row.key);
          }
        }),
        validate: () =>
          Effect.gen(function* () {
            for (const row of retired) {
              if (Option.isSome(yield* locks.entry(row.type, row.key)))
                return yield* new WorkspaceSyncFailed({
                  category: "conflict",
                  detail: `Accepted ${row.type} ${row.key} remains after retirement`,
                });
              if (
                row.removeCanonical &&
                (yield* fs.exists(row.canonical).pipe(
                  Effect.mapError(
                    (cause) =>
                      new WorkspaceSyncFailed({
                        category: "internal",
                        detail: `Cannot verify retirement at ${row.canonical}`,
                        cause,
                      }),
                  ),
                ))
              )
                return yield* new WorkspaceSyncFailed({
                  category: "conflict",
                  detail: `Acquired content remains after retirement: ${row.canonical}`,
                });
            }
          }),
      }).pipe(
        Effect.mapError((cause) =>
          adapter.toStepFailure(
            cause instanceof WorkspaceSyncFailed
              ? cause
              : new WorkspaceSyncFailed({
                  category: "internal",
                  detail: "Acquired-state retirement failed",
                  cause,
                }),
          ),
        ),
        Effect.as({
          result: "success" as const,
          message: `Retired ${retired.length} unreachable accepted extensions`,
          artifact,
        }),
      ),
    });
  });

const isWithinOrEqual = (path: Path.Path, parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

/** `@owner/plural/name` for a well-formed installed package path. */
const leftoverIdentity = (entry: InstalledPackageEntry) =>
  [entry.owner, toExtensionTypePlural(entry.type), entry.name]
    .filter((segment) => segment !== undefined)
    .join("/");

/**
 * One removal closure per installed package that desired state no longer
 * reaches and no accepted resolution records. Location in the install root is
 * the install proof, so local byte drift does not block removal. Locked
 * leftovers stay with {@link collectUnreachableRetirement}; unrecognized
 * install-root entries are never planned.
 */
export const collectLeftoverRetirement = (
  adapter: SyncFailureAdapter,
  scope?: { readonly subjects: ReadonlyArray<Pick<ExtensionTarget, "type" | "name">> },
  observedGraph?: DesiredStateGraph,
) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const desiredState = yield* DesiredStateReader;
    const layout = yield* Ref.get(location.layout);
    const locks = yield* LockfileReader;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const graph = observedGraph ?? (yield* desiredState.graph());
    if (!graph.complete) return [];
    const inventory = yield* observeInstallRoot({ layout, graph, locks });
    const acceptedPaths = (yield* Effect.forEach(extensionTypes, (type) =>
      locks
        .entries(type)
        .pipe(
          Effect.map((entries) =>
            Object.values(entries).map(
              (entry) =>
                computeExtensionPathsForLayout(
                  path.join,
                  layout,
                  extensionPathSourceFromLockEntry(entry),
                  toExtensionTypePlural(type),
                  entry.identity.name,
                ).canonicalPath,
            ),
          ),
        ),
    )).flat();
    const leftovers = inventory.leftovers.filter(
      (entry) =>
        entry.lockKey === undefined &&
        // Never remove a directory that holds another accepted package.
        !acceptedPaths.some((accepted) => isWithinOrEqual(path, entry.path, accepted)) &&
        (scope === undefined ||
          scope.subjects.some(
            (subject) => subject.type === entry.type && subject.name === entry.name,
          )),
    );
    return yield* Effect.forEach(leftovers, (leftover) =>
      Effect.gen(function* () {
        yield* validatePathSafety(path, inventory.root, leftover.path);
        const relative = path.relative(location.baseDir, leftover.path);
        const identity = leftoverIdentity(leftover);
        const artifact = {
          path: relative,
          scope: location.scope,
          change: "removed" as const,
          targets: [{ path: relative, change: "removed" as const, entryName: leftover.name }],
        };
        const failed = (detail: string, cause?: unknown) =>
          new WorkspaceSyncFailed({
            category: cause === undefined ? "conflict" : "internal",
            detail,
            ...(cause === undefined ? {} : { cause }),
          });
        const step: PlannedJobStep<SyncStepRequirements | LockfileReader> = {
          key: `leftover:${relative}`,
          label: `${leftover.type} ${identity} at ${relative} (installed, not desired)`,
          readiness: "ready",
          artifact,
          run: runWorkspaceTransaction({
            transition: Effect.gen(function* () {
              const current = yield* desiredState.graph();
              const observed = yield* observeInstallRoot({
                layout,
                graph: current,
                locks,
              });
              const entry = observed.packages.find(({ path: at }) => at === leftover.path);
              if (entry === undefined) return;
              if (!current.complete || entry.reached || entry.lockKey !== undefined)
                return yield* failed(
                  `Desired reachability of ${leftover.type} ${identity} changed before removal`,
                );
              yield* protectWorkspacePath(leftover.path);
              yield* fs
                .remove(leftover.path, { recursive: true })
                .pipe(
                  Effect.mapError((cause) =>
                    failed(`Could not remove installed package ${leftover.path}`, cause),
                  ),
                );
            }),
            validate: () =>
              fs.exists(leftover.path).pipe(
                Effect.mapError((cause) =>
                  failed(`Cannot verify removal of ${leftover.path}`, cause),
                ),
                Effect.flatMap((remains) =>
                  remains
                    ? Effect.fail(
                        failed(`Installed package remains after removal: ${leftover.path}`),
                      )
                    : Effect.void,
                ),
              ),
          }).pipe(
            Effect.mapError((cause) =>
              adapter.toStepFailure(
                cause instanceof WorkspaceSyncFailed
                  ? cause
                  : new WorkspaceSyncFailed({
                      category: "internal",
                      detail: `Removing installed package ${identity} failed`,
                      cause,
                    }),
              ),
            ),
            Effect.as({
              result: "success" as const,
              message: `Removed ${leftover.type} ${identity}: installed but not desired`,
              artifact,
            }),
          ),
        };
        return step;
      }),
    );
  });

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  extensionTypes,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  AcceptedResolutionWriter,
  LockfileReader,
  WorkspaceMutations,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  computeMaterializedTreeIntegrity,
  validatePathSafety,
  lockEntrySemanticallyEqual,
  type DesiredStateGraph,
  type ExtensionTarget,
} from "@agentxm/workspace-state";
import { protectWorkspacePath, runWorkspaceTransaction } from "@agentxm/workspace-transactions";
import type { PlannedJobStep } from "@agentxm/workspace-operations";
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
) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const locks = yield* LockfileReader;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const graph = scope?.resultingGraph ?? (yield* ws.getDesiredStateGraph());
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
    const canonicalPath = ({ type, entry }: (typeof accepted)[number]) =>
      computeExtensionPathsForLayout(
        path.join,
        ws.layout,
        extensionPathSourceFromLockEntry(entry),
        toExtensionTypePlural(type),
        entry.workspaceName,
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
              (subject) => subject.type === type && subject.name === entry.workspaceName,
            )),
      ),
      (row) =>
        Effect.gen(function* () {
          const canonical = canonicalPath(row);
          yield* validatePathSafety(path, ws.layout.acquiredRoot, canonical);
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
      path: ws.scope === "project" ? "axm-lock.yaml" : ".axm/workspace/axm-lock.yaml",
      scope: ws.scope,
      change: "updated" as const,
      references: retired
        .filter((row) => !row.removeCanonical)
        .map((row) => ({
          path: path.relative(ws.baseDir, row.canonical),
          state: row.exists ? ("retained" as const) : ("absent" as const),
          reason: row.exists
            ? "shared acquired content remains desired"
            : "canonical content is already absent",
        })),
      targets: retired
        .filter((row) => row.removeCanonical)
        .map((row) => ({
          path: path.relative(ws.baseDir, row.canonical),
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
          const current = yield* ws.getDesiredStateGraph();
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

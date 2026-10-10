import { nativePackageReferences } from "../projection/index.js";
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
  lockfileDisplayPath,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  computeMaterializedTreeIntegrity,
  desiredReachesAcceptedRow,
  validatePathSafety,
  lockEntrySemanticallyEqual,
  unresolvedPackRoutes,
  type DesiredStateGraph,
  type ExtensionTarget,
} from "../workspace-state/index.js";
import { protectWorkspacePath, runWorkspaceTransaction } from "../settlement/index.js";
import type { PlannedJobStep } from "../operations/index.js";
import { WorkspaceSyncFailed } from "./errors.js";
import type { StepFailureConversionService } from "./step-failure-conversion.js";
import type { SyncStepRequirements } from "./plan.js";

/** A full-graph maintenance closure; never infers intent from accepted records. */
export const collectUnreachableRetirement = (
  adapter: StepFailureConversionService,
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
    // Retiring a row rests on proving no desired route reaches it; while an
    // active Pack's routes are unresolved, that proof is unavailable.
    if (unresolvedPackRoutes(graph).length > 0)
      return Option.none<PlannedJobStep<SyncStepRequirements | LockfileReader>>();
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
              locks
                .acceptedEntry("mcp-server", subject.name)
                .pipe(Effect.map(Option.getOrUndefined)),
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
      accepted.filter((row) => desiredReachesAcceptedRow(graph, row)).map(canonicalPath),
    );
    const retired = yield* Effect.forEach(
      accepted.filter(
        (row) =>
          !desiredReachesAcceptedRow(graph, row) &&
          (scope === undefined ||
            scope.subjects.some(
              (subject) => subject.type === row.type && subject.name === row.entry.identity.name,
            ) ||
            (row.type === "mcp-server" &&
              scopedMcpEntries.some((scoped) => lockEntrySemanticallyEqual(scoped, row.entry)))),
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
          const nativeReferences =
            exists && (row.type === "mcp-server" || row.type === "hook" || row.type === "pack")
              ? yield* nativePackageReferences({
                  workspaceRoot: location.baseDir,
                  nativeDirectoryInputs: location.nativeDirectoryInputs,
                  scope: location.scope,
                  packageRoot: canonical,
                }).pipe(
                  Effect.mapError(
                    (cause) =>
                      new WorkspaceSyncFailed({
                        category: "conflict",
                        detail: `Cannot inspect retained native references to ${canonical}`,
                        cause,
                      }),
                  ),
                )
              : [];
          return {
            ...row,
            canonical,
            shared,
            exists,
            nativeReferences,
            removeCanonical: exists && !shared && nativeReferences.length === 0,
          };
        }),
    );
    if (retired.length === 0)
      return Option.none<PlannedJobStep<SyncStepRequirements | LockfileReader>>();
    const retainedNative = retired.filter((row) => row.nativeReferences.length > 0);
    const removable = retired.filter((row) => row.nativeReferences.length === 0);
    if (removable.length === 0)
      return Option.none<PlannedJobStep<SyncStepRequirements | LockfileReader>>();
    const retiredPackages = [...new Map(retired.map((row) => [row.canonical, row])).values()];
    const artifact = {
      path: lockfileDisplayPath(location.scope),
      scope: location.scope,
      change: removable.length === 0 ? ("unchanged" as const) : ("updated" as const),
      references: retiredPackages
        .filter((row) => !row.removeCanonical)
        .map((row) => ({
          path: path.relative(location.baseDir, row.canonical),
          state: row.exists ? ("retained" as const) : ("absent" as const),
          reason:
            row.nativeReferences.length > 0
              ? `Retained native registrations reference package code at ${row.nativeReferences.join(", ")}; canonical content and accepted resolution remain.`
              : row.exists
                ? "shared acquired content remains desired"
                : "canonical content is already absent",
        })),
      targets: retiredPackages
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
          const current = yield* (yield* DesiredStateReader).graph();
          const currentLocks = yield* LockfileReader;
          if (
            unresolvedPackRoutes(current).length > 0 ||
            retired.some((row) => desiredReachesAcceptedRow(current, row))
          ) {
            return yield* new WorkspaceSyncFailed({
              category: "conflict",
              detail: "Desired reachability changed before retirement",
            });
          }
          const remaining: Array<(typeof retired)[number]> = [];
          for (const row of removable) {
            const accepted = yield* currentLocks.entry(row.type, row.key);
            // An earlier step of this run may have settled the row already
            // (materializing authored content withdraws the resolution it
            // supersedes); the retired state then already holds.
            if (Option.isNone(accepted)) continue;
            if (!lockEntrySemanticallyEqual(accepted.value, row.entry))
              return yield* new WorkspaceSyncFailed({
                category: "conflict",
                detail: `Accepted ${row.type} ${row.key} changed before retirement`,
              });
            remaining.push(row);
          }
          const packages = [...new Map(remaining.map((row) => [row.canonical, row])).values()];
          for (const row of packages) {
            if (row.removeCanonical) {
              if (row.type === "mcp-server" || row.type === "hook" || row.type === "pack") {
                const references = yield* nativePackageReferences({
                  workspaceRoot: location.baseDir,
                  nativeDirectoryInputs: location.nativeDirectoryInputs,
                  scope: location.scope,
                  packageRoot: row.canonical,
                });
                if (references.length > 0)
                  return yield* new WorkspaceSyncFailed({
                    category: "conflict",
                    detail: `Native registrations began referencing ${row.canonical} before retirement`,
                  });
              }
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
          }
          if (remaining.length > 0)
            yield* (yield* AcceptedResolutionWriter).removeAcceptedEntries(remaining);
        }),
        validate: () =>
          Effect.gen(function* () {
            const currentLocks = yield* LockfileReader;
            for (const row of removable) {
              if (Option.isSome(yield* currentLocks.entry(row.type, row.key)))
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
        Effect.mapError(adapter.toStepFailure),
        Effect.as({
          result: "success" as const,
          message: `Retired ${removable.length} unreachable accepted extensions${retainedNative.length === 0 ? "" : `; retained ${retainedNative.length} packages referenced by native registrations`}`,
          ...(removable.length === 0 ? { disposition: "unchanged" as const } : {}),
          artifact,
        }),
      ),
    });
  });

/**
 * Canonical package directory machinery: sibling staging/swap replacement,
 * interrupted-swap recovery, create-only publication, reuse decisions, and
 * external (non-registry) package materialization.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { fromFileLocation } from "@agentxm/host-primitives";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  createWorkspaceDirectories,
  protectWorkspacePath,
  type WorkspaceSnapshotError,
} from "../settlement/index.js";
import { recordFootprint } from "../settlement/index.js";
import { DirectoryCopyLimitExceeded, copyExtensionDirectory } from "./copy-directory.js";
import { validatePathSafety } from "../workspace-state/index.js";
import {
  CreateDestinationExists,
  PackageCopyFailed,
  PackageMaterializationFailed,
  StagedPackageInvalid,
} from "./errors.js";
import { PathTraversalDetected } from "../workspace-state/index.js";
import {
  computeMaterializedTreeIntegrity,
  observeAcceptedCanonicalReuse,
  type LockEntry,
  type MaterializedTreeInvalid,
  type RequestedCanonicalRef,
  type TreeIntegrity,
} from "../workspace-state/index.js";

export const canonicalMaterializationPaths = (canonicalPath: string) => ({
  stagingPath: `${canonicalPath}.axm-staging`,
  backupPath: `${canonicalPath}.axm-backup`,
});

/** Failures the sibling staging/swap machinery itself can produce. */
export type CanonicalDirectoryReplacementError =
  PackageMaterializationFailed | PathTraversalDetected | WorkspaceSnapshotError;

/**
 * Resolve the sibling replacement state left by an interrupted swap.
 *
 * `replaceCanonicalDirectory` never populates the canonical path in place: it
 * fills a sibling staging directory, then commits with two same-parent renames.
 * So the canonical path only ever holds a whole tree, and the pair of
 * (canonical present, backup present) names the interruption point exactly:
 *
 * - backup, no canonical — died between the two renames; restore the backup.
 * - backup and canonical — the second rename landed; the backup is superseded.
 * - no backup — nothing was swapped; only staging needs discarding.
 */
const recoverInterruptedReplacement = (canonicalPath: string, fs: FileSystem.FileSystem) =>
  Effect.gen(function* () {
    const { stagingPath, backupPath } = canonicalMaterializationPaths(canonicalPath);
    const canonicalExists = yield* fs.exists(canonicalPath);
    const backupExists = yield* fs.exists(backupPath);

    if (backupExists && !canonicalExists) {
      yield* fs.rename(backupPath, canonicalPath);
    } else if (backupExists) {
      yield* fs.remove(backupPath, { recursive: true, force: true });
    }
    yield* fs.remove(stagingPath, { recursive: true, force: true });
  }).pipe(
    Effect.mapError(
      (cause) => new PackageMaterializationFailed({ path: canonicalPath, step: "recover", cause }),
    ),
  );

export interface RecoverCanonicalDirectoryArgs {
  readonly baseDir: string;
  readonly canonicalPath: string;
}

/** Recover or clean sibling replacement state before any fallible source work. */
export const recoverCanonicalDirectory = (args: RecoverCanonicalDirectoryArgs) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stagingPath, backupPath } = canonicalMaterializationPaths(args.canonicalPath);
    yield* validatePathSafety(path, args.baseDir, args.canonicalPath);
    yield* validatePathSafety(path, args.baseDir, stagingPath);
    yield* validatePathSafety(path, args.baseDir, backupPath);
    yield* recoverInterruptedReplacement(args.canonicalPath, fs);
  });

export interface ReplaceCanonicalDirectoryArgs<E, R> {
  readonly baseDir: string;
  readonly canonicalPath: string;
  /** Internal scoped acquisition staging: its resource owner removes this transient tree. */
  readonly transient?: boolean;
  readonly populate: (stagingPath: string) => Effect.Effect<void, E, R>;
  readonly validate?: (stagingPath: string) => Effect.Effect<void, E, R>;
  /** Acquire eligible parent creation proof; record it only after publication. */
  readonly prepareParents?: Effect.Effect<Effect.Effect<void, E, R>, E, R>;
}

export interface ReplaceCanonicalDirectoryWithInspectionArgs<
  A,
  E,
  R,
> extends ReplaceCanonicalDirectoryArgs<E, R> {
  readonly inspect: (stagingPath: string) => Effect.Effect<A, E, R>;
}

export interface CanonicalDirectoryInspection<A> {
  readonly canonicalPath: string;
  readonly inspection: A;
}

export interface CreateCanonicalDirectoryArgs<E, R> extends ReplaceCanonicalDirectoryArgs<E, R> {
  /** Human-readable create-only subject used in collision diagnostics. */
  readonly subject: string;
  /** Type-defined files that must exist in the complete staged package. */
  readonly requiredFiles?: ReadonlyArray<string>;
}

const validateRequiredPackageFiles = (stagingPath: string, requiredFiles: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* Effect.forEach(
      requiredFiles,
      (relativePath) =>
        Effect.gen(function* () {
          const filePath = path.join(stagingPath, relativePath);
          yield* validatePathSafety(path, stagingPath, filePath);
          const info = yield* fs
            .stat(filePath)
            .pipe(
              Effect.mapError(
                (cause) => new StagedPackageInvalid({ file: relativePath, kind: "missing", cause }),
              ),
            );
          if (info.type !== "File") {
            return yield* new StagedPackageInvalid({ file: relativePath, kind: "not-file" });
          }
        }),
      { discard: true },
    );
  });

/**
 * Publish a complete canonical tree from a sibling staging directory. Recovery
 * restores a prior tree left in the sibling backup by abrupt process death;
 * incomplete staging is never made eligible for reuse.
 */
export const replaceCanonicalDirectoryWithInspection = <A, E, R>(
  args: ReplaceCanonicalDirectoryWithInspectionArgs<A, E, R>,
): Effect.Effect<
  CanonicalDirectoryInspection<A>,
  E | CanonicalDirectoryReplacementError,
  FileSystem.FileSystem | Path.Path | R
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stagingPath, backupPath } = canonicalMaterializationPaths(args.canonicalPath);

    yield* recoverCanonicalDirectory(args);
    const recordParents =
      args.transient === true || args.prepareParents === undefined
        ? yield* createWorkspaceDirectories({
            nativeRoot: args.baseDir,
            workspaceDir: path.join(args.baseDir, ".axm"),
            target: path.dirname(args.canonicalPath),
            ...(args.transient === true ? {} : { prepare: protectWorkspacePath }),
            record: (identity) =>
              args.transient === true
                ? Effect.void
                : recordFootprint({ path: identity.physicalPath, change: "created" }),
          }).pipe(
            Effect.as(Effect.void),
            Effect.mapError(
              (cause) =>
                new PackageMaterializationFailed({
                  path: args.canonicalPath,
                  step: "prepare-parent",
                  cause,
                }),
            ),
          )
        : yield* args.prepareParents;

    const inspection = yield* Effect.gen(function* () {
      yield* fs.makeDirectory(stagingPath, { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new PackageMaterializationFailed({
              path: stagingPath,
              step: "prepare-staging",
              cause,
            }),
        ),
      );
      yield* args.populate(stagingPath);
      if (args.validate !== undefined) yield* args.validate(stagingPath);
      return yield* args.inspect(stagingPath);
    }).pipe(
      Effect.tapError(() =>
        fs.remove(stagingPath, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    );
    if (args.transient !== true) yield* protectWorkspacePath(args.canonicalPath);
    const hadCanonical = yield* fs
      .exists(args.canonicalPath)
      .pipe(
        Effect.mapError(
          (cause) =>
            new PackageMaterializationFailed({ path: args.canonicalPath, step: "inspect", cause }),
        ),
      );
    // The footprint reports byte changes: replacing a tree with an identical
    // one is not one, however it was acquired.
    const previousTreeIntegrity = hadCanonical
      ? yield* computeMaterializedTreeIntegrity(args.canonicalPath).pipe(Effect.option)
      : Option.none<TreeIntegrity>();
    yield* Effect.uninterruptible(
      Effect.gen(function* () {
        if (hadCanonical) yield* fs.rename(args.canonicalPath, backupPath);
        yield* fs
          .rename(stagingPath, args.canonicalPath)
          .pipe(
            Effect.tapError(() =>
              hadCanonical
                ? fs.rename(backupPath, args.canonicalPath).pipe(Effect.ignore)
                : Effect.void,
            ),
          );
        yield* fs.remove(backupPath, { recursive: true, force: true });
      }),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new PackageMaterializationFailed({ path: args.canonicalPath, step: "replace", cause }),
      ),
    );
    const replacedTreeIntegrity = yield* computeMaterializedTreeIntegrity(args.canonicalPath).pipe(
      Effect.option,
    );
    if (
      args.transient !== true &&
      (Option.isNone(previousTreeIntegrity) ||
        Option.isNone(replacedTreeIntegrity) ||
        previousTreeIntegrity.value !== replacedTreeIntegrity.value)
    ) {
      yield* recordFootprint({
        path: args.canonicalPath,
        change: hadCanonical ? "modified" : "created",
      });
    }

    yield* recordParents;
    return { canonicalPath: args.canonicalPath, inspection };
  });

export const replaceCanonicalDirectory = <E, R>(
  args: ReplaceCanonicalDirectoryArgs<E, R>,
): Effect.Effect<
  string,
  E | CanonicalDirectoryReplacementError,
  FileSystem.FileSystem | Path.Path | R
> =>
  replaceCanonicalDirectoryWithInspection({
    ...args,
    inspect: () => Effect.void,
  }).pipe(Effect.map(({ canonicalPath }) => canonicalPath));

/**
 * Publish one create-only authored package without ever populating its
 * canonical directory in place. Interrupted sibling state is resolved before
 * the collision check while the caller holds the workspace mutation lock.
 */
export const createCanonicalDirectory = <E, R>(
  args: CreateCanonicalDirectoryArgs<E, R>,
): Effect.Effect<
  string,
  E | CanonicalDirectoryReplacementError | CreateDestinationExists | StagedPackageInvalid,
  FileSystem.FileSystem | Path.Path | R
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* recoverCanonicalDirectory(args);
    const exists = yield* fs.exists(args.canonicalPath).pipe(
      Effect.mapError(
        (cause) =>
          new PackageMaterializationFailed({
            path: args.canonicalPath,
            step: "inspect-create-destination",
            cause,
          }),
      ),
    );
    if (exists) {
      return yield* new CreateDestinationExists({
        subject: args.subject,
        path: args.canonicalPath,
      });
    }

    return yield* replaceCanonicalDirectory({
      baseDir: args.baseDir,
      canonicalPath: args.canonicalPath,
      ...(args.transient === undefined ? {} : { transient: args.transient }),
      ...(args.prepareParents === undefined ? {} : { prepareParents: args.prepareParents }),
      populate: args.populate,
      validate: (stagingPath) =>
        validateRequiredPackageFiles(stagingPath, args.requiredFiles ?? []).pipe(
          Effect.andThen(args.validate === undefined ? Effect.void : args.validate(stagingPath)),
        ),
    });
  });

/**
 * The accepted canonical tree an acquisition may keep instead of
 * materializing the requested ref again, after any interrupted replacement
 * at the path is resolved. Canonical observation owns the decision; this
 * only readies the directory it judges.
 */
export const reusableCanonicalTree = (args: {
  readonly canonicalPath: string;
  readonly requested: RequestedCanonicalRef;
  readonly accepted: Option.Option<LockEntry>;
  readonly force: boolean;
}): Effect.Effect<
  Option.Option<TreeIntegrity>,
  PackageMaterializationFailed,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* recoverInterruptedReplacement(args.canonicalPath, fs);
    return yield* observeAcceptedCanonicalReuse(args);
  });

export interface MaterializedPackage {
  readonly canonicalPath: string;
  readonly treeIntegrity: TreeIntegrity;
}

export interface MaterializeExternalPackageArgs<E = never, R = never> {
  readonly transient?: boolean;
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly sourceLocation: string;
  readonly copyFailureCode: "internal" | "validation";
  readonly copyFailureDetail: (canonicalPath: string) => string;
  readonly prepareParents?: Effect.Effect<Effect.Effect<void, E, R>, E, R>;
  readonly validate?: (
    stagingPath: string,
  ) => Effect.Effect<void, E, FileSystem.FileSystem | Path.Path | R>;
}

export const materializeExternalPackageWithTreeIntegrity = <E = never, R = never>(
  args: MaterializeExternalPackageArgs<E, R>,
): Effect.Effect<
  MaterializedPackage,
  E | PackageCopyFailed | CanonicalDirectoryReplacementError | MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path | R
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    yield* validatePathSafety(path, args.baseDir, args.canonicalPath);

    const sourcePath = fromFileLocation(args.sourceLocation);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(args.canonicalPath);
    if (isSelfCopy) {
      return {
        canonicalPath: args.canonicalPath,
        treeIntegrity: yield* computeMaterializedTreeIntegrity(args.canonicalPath),
      };
    }

    const result = yield* replaceCanonicalDirectoryWithInspection<
      TreeIntegrity,
      E | PackageCopyFailed | MaterializedTreeInvalid,
      FileSystem.FileSystem | Path.Path | R
    >({
      baseDir: args.baseDir,
      canonicalPath: args.canonicalPath,
      ...(args.transient === undefined ? {} : { transient: args.transient }),
      ...(args.prepareParents === undefined ? {} : { prepareParents: args.prepareParents }),
      populate: (stagingPath) =>
        copyExtensionDirectory(sourcePath, stagingPath).pipe(
          Effect.mapError(
            (cause) =>
              new PackageCopyFailed({
                severity:
                  cause instanceof DirectoryCopyLimitExceeded ? "validation" : args.copyFailureCode,
                detail:
                  cause instanceof DirectoryCopyLimitExceeded
                    ? `Extension content exceeds the ${cause.limit} ${cause.resource} copy limit`
                    : args.copyFailureDetail(args.canonicalPath),
                cause,
              }),
          ),
        ),
      ...(args.validate === undefined ? {} : { validate: args.validate }),
      inspect: computeMaterializedTreeIntegrity,
    });
    return {
      canonicalPath: result.canonicalPath,
      treeIntegrity: result.inspection,
    };
  });

export const materializeExternalPackage = <E = never, R = never>(
  args: MaterializeExternalPackageArgs<E, R>,
) =>
  materializeExternalPackageWithTreeIntegrity(args).pipe(
    Effect.map(({ canonicalPath }) => canonicalPath),
  );

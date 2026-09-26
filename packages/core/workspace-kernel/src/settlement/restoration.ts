/**
 * Snapshot restoration and verification: the mechanics that put a protected
 * path back to its preimage through validated staging and atomic publication,
 * and prove afterwards that they did. Package-private; the transaction runner
 * and the closure rollback are the only callers.
 */

import { createHash, randomBytes } from "node:crypto";

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";

import { WorkspaceRestorationError } from "./errors.js";
import { recordFootprint } from "./footprint-recorder.js";
import type { Snapshot } from "./ledger.js";

/** Distinct, resolved targets with any target nested under another dropped. */
export const normalizedTargets = (
  path: Path.Path,
  targets: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const sorted = Array.from(new Set(targets.map((target) => path.resolve(target)))).sort(
    (left, right) => left.length - right.length || left.localeCompare(right),
  );
  const retained: Array<string> = [];
  for (const target of sorted) {
    if (retained.some((parent) => target === parent || target.startsWith(`${parent}${path.sep}`))) {
      continue;
    }
    retained.push(target);
  }
  return retained;
};

/** A target relative to the workspace root, or absolute when it lies outside. */
export const workspaceRelative = (
  path: Path.Path,
  workspaceDir: string,
  target: string,
): string => {
  const relative = path.relative(path.dirname(workspaceDir), target);
  return relative.startsWith("..") ? target : relative;
};

const sha256 = (input: string | Uint8Array): string =>
  createHash("sha256").update(input).digest("hex");

/**
 * Deterministic content hash of a path's current state: file bytes, symlink
 * target, recursive directory listing, or the literal `absent`. Every
 * platform error collapses to `unhashable`, which never verifies equal.
 */
const hashPathState = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(target).pipe(Effect.option);
    if (Option.isSome(link)) return sha256(`symlink:${link.value}`);
    const exists = yield* fs.exists(target);
    if (!exists) return "absent";
    const info = yield* fs.stat(target);
    if (info.type === "Directory") {
      const entries = [...(yield* fs.readDirectory(target))].sort();
      const parts: Array<string> = [];
      for (const entry of entries) {
        const child = yield* hashPathState(fs, path, path.join(target, entry));
        parts.push(`${entry}:${child}`);
      }
      return sha256(`dir:${parts.join("\n")}`);
    }
    const bytes = yield* fs.readFile(target);
    return sha256(bytes);
  }).pipe(Effect.catch(() => Effect.succeed("unhashable")));

/** Whether anything occupies the path: a file, directory, or (broken) symlink. */
const pathPresent = (
  fs: FileSystem.FileSystem,
  target: string,
): Effect.Effect<boolean, PlatformError> =>
  fs.readLink(target).pipe(
    Effect.map(() => true),
    Effect.catch(() => fs.exists(target)),
  );

/**
 * Restore one snapshot through validated staging and atomic publication.
 * The restored content is fully staged and validated in an owned
 * `<target>.tmp.<unique>` sibling before a rename publishes it, so abrupt
 * termination — including a forced process exit — can never expose a
 * partially restored target: the authoritative path holds the failure-time
 * content, the restored content, or (for a directory swap only, between two
 * renames) nothing, never a partial tree. The target path itself is never
 * removed; only owned `.tmp.` siblings are.
 */
const restoreSnapshot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshot: Snapshot,
): Effect.Effect<void, PlatformError | WorkspaceRestorationError> =>
  Effect.gen(function* () {
    if (snapshot.state === "absent") {
      if (!(yield* pathPresent(fs, snapshot.target))) return;
      // Publishing absence is one rename: the mutated tree leaves the
      // authoritative path atomically, then the owned trash is removed.
      const trash = `${snapshot.target}.tmp.${randomBytes(6).toString("hex")}`;
      yield* fs.rename(snapshot.target, trash);
      yield* fs.remove(trash, { recursive: true, force: true }).pipe(Effect.ignore);
      return;
    }
    yield* fs.makeDirectory(path.dirname(snapshot.target), { recursive: true });
    const staging = `${snapshot.target}.tmp.${randomBytes(6).toString("hex")}`;
    yield* Effect.gen(function* () {
      if (snapshot.state === "symlink") {
        yield* fs.symlink(snapshot.linkTarget, staging);
        const staged = yield* fs.readLink(staging);
        if (staged !== snapshot.linkTarget) {
          return yield* new WorkspaceRestorationError({
            target: snapshot.target,
            step: "stage",
            cause: { staged, expected: snapshot.linkTarget },
          });
        }
      } else {
        yield* fs.copy(snapshot.backup, staging, { preserveTimestamps: true });
        const stagedHash = yield* hashPathState(fs, path, staging);
        const backupHash = yield* hashPathState(fs, path, snapshot.backup);
        if (stagedHash !== backupHash || stagedHash === "unhashable") {
          return yield* new WorkspaceRestorationError({
            target: snapshot.target,
            step: "stage",
            cause: { stagedHash, backupHash },
          });
        }
      }
      const targetLink = yield* fs.readLink(snapshot.target).pipe(Effect.option);
      const targetInfo = Option.isSome(targetLink)
        ? Option.none<FileSystem.File.Info>()
        : yield* fs.stat(snapshot.target).pipe(Effect.option);
      const targetPresent = Option.isSome(targetLink) || Option.isSome(targetInfo);
      const targetIsDirectory = Option.exists(targetInfo, (info) => info.type === "Directory");
      const stagedIsDirectory =
        snapshot.state === "copied" && (yield* fs.stat(staging)).type === "Directory";
      if (!targetPresent || (!targetIsDirectory && !stagedIsDirectory)) {
        // rename atomically replaces a file or symlink target.
        yield* fs.rename(staging, snapshot.target);
        return;
      }
      // A directory is swapped through two renames of owned names; the
      // moved-aside content is intact in the trash sibling until removal.
      const trash = `${snapshot.target}.tmp.${randomBytes(6).toString("hex")}`;
      yield* fs.rename(snapshot.target, trash);
      yield* fs.rename(staging, snapshot.target);
      yield* fs.remove(trash, { recursive: true, force: true }).pipe(Effect.ignore);
    }).pipe(
      Effect.onError(() =>
        fs.remove(staging, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    );
  });

/** Restore snapshots in reverse order, stopping once lock ownership is lost. */
export const restoreAll = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
  transitionCompromised: () => boolean,
): Effect.Effect<void, PlatformError | WorkspaceRestorationError> =>
  Effect.forEach(
    [...snapshots].reverse(),
    (snapshot) =>
      Effect.suspend((): Effect.Effect<void, PlatformError | WorkspaceRestorationError> =>
        // Restoration is a durable write like any other: once lock ownership
        // is lost it must stop, or it could overwrite a successor's work.
        transitionCompromised()
          ? Effect.fail(
              new WorkspaceRestorationError({
                target: snapshot.target,
                step: "stopped",
                cause: undefined,
              }),
            )
          : restoreSnapshot(fs, path, snapshot).pipe(
              Effect.andThen(recordFootprint({ path: snapshot.target, change: "restored" })),
            ),
      ),
    {
      discard: true,
    },
  );

/** Prove every snapshot's target is byte-for-byte its preimage again. */
export const verifySnapshots = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshots: ReadonlyArray<Snapshot>,
): Effect.Effect<void, WorkspaceRestorationError> =>
  Effect.forEach(
    snapshots,
    (snapshot) =>
      Effect.gen(function* () {
        const verified = yield* Effect.gen(function* () {
          if (snapshot.state === "absent") {
            return !(yield* fs.exists(snapshot.target));
          }
          if (snapshot.state === "symlink") {
            const link = yield* fs.readLink(snapshot.target).pipe(Effect.option);
            return Option.exists(link, (value) => value === snapshot.linkTarget);
          }
          const restored = yield* hashPathState(fs, path, snapshot.target);
          const backup = yield* hashPathState(fs, path, snapshot.backup);
          return restored === backup && restored !== "unhashable";
        }).pipe(Effect.catch(() => Effect.succeed(false)));
        if (!verified) {
          return yield* new WorkspaceRestorationError({
            target: snapshot.target,
            step: "verify",
            cause: { state: snapshot.state },
          });
        }
      }),
    { discard: true },
  );

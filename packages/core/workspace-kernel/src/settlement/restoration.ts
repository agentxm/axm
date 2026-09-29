/**
 * Snapshot restoration and verification: the mechanics that put a protected
 * path back to its preimage through validated staging and atomic publication,
 * and prove afterwards that they did. Package-private; the transaction runner
 * and the closure rollback are the only callers.
 */

import { createHash, randomBytes } from "node:crypto";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";

import { WorkspaceRestorationError } from "./errors.js";
import { recordFootprint } from "./footprint-recorder.js";
import type { Snapshot } from "./ledger.js";
import {
  equalPathStates,
  observeAncestorRoute,
  observePathState,
  sameRootEntry,
} from "./path-state.js";
import { resolveNativeEntry, resolveNativeReferent } from "../locations/index.js";

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

/** Restore bytes around retained originals without replacing their identities. */
const reconcilePreimage = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  source: string,
  target: string,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    const sourceLink = yield* fs.readLink(source).pipe(Effect.option);
    const targetLink = yield* fs.readLink(target).pipe(Effect.option);
    if (Option.isSome(sourceLink)) {
      if (Option.isSome(targetLink) && sourceLink.value === targetLink.value) return;
      yield* fs.remove(target, { recursive: true, force: true });
      yield* fs.symlink(sourceLink.value, target);
      return;
    }
    const sourceInfo = yield* fs.stat(source);
    const targetInfo = Option.isSome(targetLink)
      ? Option.none<FileSystem.File.Info>()
      : yield* fs.stat(target).pipe(Effect.option);
    if (sourceInfo.type === "Directory") {
      if (!Option.exists(targetInfo, (info) => info.type === "Directory")) {
        yield* fs.remove(target, { recursive: true, force: true });
        yield* fs.makeDirectory(target, { recursive: true });
      }
      const entries = yield* fs.readDirectory(source);
      for (const extra of yield* fs.readDirectory(target)) {
        if (!entries.includes(extra))
          yield* fs.remove(path.join(target, extra), { recursive: true, force: true });
      }
      for (const entry of entries)
        yield* reconcilePreimage(fs, path, path.join(source, entry), path.join(target, entry));
    } else {
      if (Option.isSome(targetLink) || Option.exists(targetInfo, (info) => info.type !== "File"))
        yield* fs.remove(target, { recursive: true, force: true });
      const bytes = yield* fs.readFile(source);
      const current = yield* fs.readFile(target).pipe(Effect.option);
      if (Option.isNone(current) || sha256(current.value) !== sha256(bytes))
        yield* fs.writeFile(target, bytes);
    }
    yield* fs.chmod(target, sourceInfo.mode);
  });

const originalRetirements = (fs: FileSystem.FileSystem, path: Path.Path, snapshot: Snapshot) =>
  Effect.gen(function* () {
    const unique = new Map<string, NonNullable<Snapshot["retirements"]>[number]>();
    for (const entry of snapshot.retirements ?? []) {
      if (unique.has(entry.target) || snapshot.state === "absent") continue;
      const originallyPresent =
        snapshot.state === "symlink"
          ? entry.target === snapshot.target
          : yield* pathPresent(
              fs,
              path.join(snapshot.backup, path.relative(snapshot.target, entry.target)),
            );
      if (originallyPresent) unique.set(entry.target, entry);
    }
    return [...unique.values()].sort((left, right) => left.target.length - right.target.length);
  });

/**
 * Restore one matching postimage. Original entries are restored by rename
 * from retirement or reconciled in place when their identity survives;
 * other copied preimages are validated in an owned staging sibling before
 * publication. A failed step retains recovery evidence and fails typed.
 */
const restoreSnapshot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  snapshot: Snapshot,
): Effect.Effect<void, PlatformError | WorkspaceRestorationError> =>
  Effect.gen(function* () {
    // A matching leaf can have been moved with its parent and reached through
    // a new alias. Its bytes/inode alone do not authorize the new route.
    yield* Effect.gen(function* () {
      // Forward admission already selected this authority. AXM's matching
      // postimage may itself introduce a workspace marker, so restoration
      // proves that original route instead of interpreting its new contents.
      const address = yield* resolveNativeEntry(snapshot.target);
      const physicalRoot = yield* resolveNativeReferent(snapshot.route.nativeRoot);
      const rootLink = Option.getOrUndefined(
        yield* fs.readLink(snapshot.route.nativeRoot).pipe(Effect.option),
      );
      const parents = new Map([
        ...(yield* observeAncestorRoute(fs, path, snapshot.target)),
        ...(yield* observeAncestorRoute(fs, path, snapshot.route.nativeRoot)),
      ]);
      if (
        address.entryPath !== snapshot.target ||
        physicalRoot !== snapshot.route.physicalRoot ||
        rootLink !== snapshot.route.rootLink ||
        [...snapshot.route.parents].some(
          ([parent, identity]) => identity === "unreadable" || parents.get(parent) !== identity,
        )
      )
        return yield* new WorkspaceRestorationError({
          target: snapshot.target,
          step: "foreign-change",
          cause: "native-parent-route-changed",
        });
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.mapError(
        (cause) =>
          new WorkspaceRestorationError({
            target: snapshot.target,
            step: "foreign-change",
            cause,
          }),
      ),
    );
    const current = yield* observePathState(fs, path, snapshot.target);
    if (!equalPathStates(current, snapshot.expected)) {
      return yield* new WorkspaceRestorationError({
        target: snapshot.target,
        step: "foreign-change",
        cause: undefined,
      });
    }
    if (snapshot.state === "absent") {
      if (!(yield* pathPresent(fs, snapshot.target))) return;
      // Publishing absence is one rename: the mutated tree leaves the
      // authoritative path atomically, then the owned trash is removed.
      const trash = `${snapshot.target}.tmp.${randomBytes(6).toString("hex")}`;
      yield* fs.rename(snapshot.target, trash);
      yield* fs.remove(trash, { recursive: true, force: true }).pipe(Effect.ignore);
      return;
    }
    if ((snapshot.retirements?.length ?? 0) > 0) {
      const originals = yield* originalRetirements(fs, path, snapshot);
      // Verify every retained original before moving any of them. A changed
      // quarantine is recovery evidence, never an acceptable preimage.
      for (const original of originals) {
        if (
          (yield* observePathState(fs, path, path.dirname(original.backup))).get("") !==
          original.storeIdentity
        ) {
          return yield* new WorkspaceRestorationError({
            target: original.backup,
            step: "foreign-change",
            cause: "retirement-store-replaced",
          });
        }
        if (
          !equalPathStates(yield* observePathState(fs, path, original.backup), original.original)
        ) {
          return yield* new WorkspaceRestorationError({
            target: original.backup,
            step: "foreign-change",
            cause: undefined,
          });
        }
      }
      for (const original of originals) {
        yield* fs.makeDirectory(path.dirname(original.target), { recursive: true });
        yield* fs.remove(original.target, { recursive: true, force: true });
        yield* fs.rename(original.backup, original.target);
      }
      if (snapshot.state === "copied")
        yield* reconcilePreimage(fs, path, snapshot.backup, snapshot.target);
      return;
    }
    // A writer that mutated in place still holds the original entry. Keep
    // that identity so valid ownership receipts survive the failed closure.
    if (snapshot.state === "copied" && sameRootEntry(snapshot.preimage, current)) {
      yield* reconcilePreimage(fs, path, snapshot.backup, snapshot.target);
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
  Effect.gen(function* () {
    const failures: Array<{
      readonly target: string;
      readonly cause: PlatformError | WorkspaceRestorationError;
    }> = [];
    for (const snapshot of [...snapshots].reverse()) {
      // Keep restoring independent boundaries after one divergence. A lost
      // workspace hold stops every subsequent write instead.
      const restored = yield* (
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
            )
      ).pipe(Effect.result);
      if (restored._tag === "Failure")
        failures.push({ target: snapshot.target, cause: restored.failure });
    }
    const first = failures[0];
    if (first !== undefined)
      return yield* new WorkspaceRestorationError({
        target: first.target,
        step: first.cause instanceof WorkspaceRestorationError ? first.cause.step : "stage",
        cause: failures,
        retained: failures.map((failure) => failure.target),
      });
  });

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
        for (const original of yield* originalRetirements(fs, path, snapshot).pipe(
          Effect.mapError(
            (cause) =>
              new WorkspaceRestorationError({ target: snapshot.target, step: "verify", cause }),
          ),
        )) {
          const restored = yield* observePathState(fs, path, original.target);
          if (restored.get("") !== original.original.get(""))
            return yield* new WorkspaceRestorationError({
              target: original.target,
              step: "verify",
              cause: "retained-entry-identity-changed",
            });
        }
        const verified = yield* Effect.gen(function* () {
          if (snapshot.state === "absent") {
            return !(yield* pathPresent(fs, snapshot.target));
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

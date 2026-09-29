import { createHash } from "node:crypto";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { writeFileAtomic } from "@agentxm/host-primitives";

import {
  NativeWriteRefused,
  type NativeInsertionCapture,
  type NativeInsertionTarget,
  type NativeWriteAuthorityService,
} from "../agent-adapters/index.js";
import {
  applyStructuralInverse,
  assertNativeMutationWithinRoots,
  captureNativeAuthorityRoots,
  nativeAuthorityRoots,
  captureContainerIdentity,
  deriveStructuralInverse,
  readContainerReceipts,
  updateContainerReceipts,
  verifyContainerIdentity,
  type ContainerIdentity,
  type ContainerReceipt,
  type ContainerReceiptMutation,
} from "../locations/index.js";
import {
  createWorkspaceDirectories,
  createdWorkspaceDirectories,
  protectCreatedAncestors,
  protectWorkspacePath,
  recordFootprint,
  retireWorkspacePath,
  WorkspaceFileWriteLocks,
} from "../settlement/index.js";
import { WorkspaceLocation } from "../workspace-state/index.js";

const digest = (raw: string): string => createHash("sha256").update(raw).digest("hex");
const sameRoute = (before: ContainerIdentity, after: ContainerIdentity): boolean => {
  return JSON.stringify(before) === JSON.stringify(after);
};

/** The owning workspace supplies persistence, authority, and transaction capabilities once. */
export const makeNativeInsertionAuthority = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const location = yield* WorkspaceLocation;
  const locks = yield* WorkspaceFileWriteLocks;
  const roots = nativeAuthorityRoots(
    path,
    { workspaceRoot: location.baseDir, scope: location.scope },
    location.nativeDirectoryInputs,
  );
  const witnesses = yield* captureNativeAuthorityRoots(roots);
  const ownerRoot = path.dirname(location.runtimeDir);
  const authorize = (target: string, mutation: "entry" | "content" = "entry") =>
    assertNativeMutationWithinRoots(roots, target, mutation, ownerRoot, witnesses);
  const context = (args: Omit<NativeInsertionTarget, "unit">) =>
    Effect.map(authorize(args.path, "content"), ({ nativeRoot }) => ({
      nativeRoot,
      ownerRoot,
      target: args.path,
      ...(args.aliases === undefined ? {} : { aliases: args.aliases }),
    }));
  const identityContext = (identity: ContainerIdentity) => ({
    nativeRoot: identity.nativeRoot,
    ownerRoot,
    target: identity.target,
    aliases: identity.aliases.map((alias) => alias.path),
  });
  const currentIdentity = (identity: ContainerIdentity) =>
    Effect.gen(function* () {
      const selected = yield* authorize(identity.target, "content").pipe(Effect.option);
      return (
        Option.isSome(selected) &&
        selected.value.nativeRoot === identity.nativeRoot &&
        (yield* verifyContainerIdentity(identity, identityContext(identity)))
      );
    });
  const finish = <A, E>(
    target: string,
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  ): Effect.Effect<A, NativeWriteRefused> =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.mapError((cause) =>
        cause instanceof NativeWriteRefused
          ? cause
          : new NativeWriteRefused({ path: target, cause }),
      ),
    );
  const createParentDirectories: NativeWriteAuthorityService["createParentDirectories"] = (
    target,
  ) =>
    finish(
      target,
      Effect.gen(function* () {
        const { address, nativeRoot } = yield* authorize(target);
        return yield* createWorkspaceDirectories({
          nativeRoot,
          workspaceDir: location.runtimeDir,
          target: path.dirname(address.entryPath),
          prepare: protectWorkspacePath,
          record: (identity) => recordFootprint({ path: identity.physicalPath, change: "created" }),
        });
      }),
    );
  const mutation: ContainerReceiptMutation<NativeWriteRefused, never> = {
    inheritedDirectories: createdWorkspaceDirectories,
    withLock: (target, effect) =>
      locks
        .withLock(target, effect)
        .pipe(
          Effect.catchTag("WorkspaceSnapshotError", (cause) =>
            Effect.fail(new NativeWriteRefused({ path: target, cause })),
          ),
        ),
    createDirectory: (target) =>
      finish(
        target,
        Effect.uninterruptible(
          Effect.gen(function* () {
            yield* authorize(target);
            yield* protectWorkspacePath(target);
            const created = yield* fs.makeDirectory(target).pipe(
              Effect.as(true),
              Effect.catch((cause) =>
                cause.reason._tag === "AlreadyExists" ? Effect.succeed(false) : Effect.fail(cause),
              ),
            );
            if (created) yield* recordFootprint({ path: target, change: "created" });
            return created;
          }),
        ),
      ),
    write: (target, contents) =>
      finish(
        target,
        Effect.gen(function* () {
          const existed = yield* fs.exists(target);
          yield* authorize(target);
          yield* protectCreatedAncestors(fs, path, path.dirname(target));
          yield* protectWorkspacePath(target);
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* writeFileAtomic(fs, {
            targetPath: target,
            content: contents,
            skipIfUnchanged: "ignore-read-errors",
            mapError: (cause) => new NativeWriteRefused({ path: target, cause }),
          });
          yield* recordFootprint({ path: target, change: existed ? "modified" : "created" });
        }),
      ),
    retire: (target) =>
      finish(
        target,
        Effect.gen(function* () {
          const { address } = yield* authorize(target);
          yield* retireWorkspacePath(target, { emptyOnly: address.kind === "directory" });
        }),
      ),
  };
  const currentRaw = (target: string) =>
    Effect.gen(function* () {
      const { address } = yield* authorize(target, "content");
      if (address.kind === "absent") return Option.none<string>();
      if (address.referentPath === undefined)
        return yield* new NativeWriteRefused({ path: target, cause: "unreadable-native-content" });
      return Option.some(yield* fs.readFileString(address.referentPath));
    });
  const proofContext = (receipt: ContainerReceipt) => identityContext(receipt.identity);
  const validReceipts = (raw: string, physicalPath: string) =>
    Effect.gen(function* () {
      const entries = (yield* readContainerReceipts(location.runtimeDir)).entries;
      const valid: Array<ContainerReceipt> = [];
      for (const receipt of entries) {
        if (receipt.identity.physicalPath !== physicalPath || receipt.contentSha256 !== digest(raw))
          continue;
        if (yield* currentIdentity(receipt.identity)) valid.push(receipt);
      }
      return valid;
    });
  const captureInsertion: NativeWriteAuthorityService["captureInsertion"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const { address } = yield* authorize(args.path, "content");
        const selectedContext = yield* context(args);
        const actual = yield* currentRaw(args.path);
        if (
          !Option.makeEquivalence<string>((left, right) => left === right)(actual, args.beforeRaw)
        )
          return yield* new NativeWriteRefused({
            path: args.path,
            cause: "native-content-changed-before-capture",
          });
        const physicalPath = address.referentPath ?? address.entryPath;
        const beforeIdentity = Option.isSome(actual)
          ? Option.some(yield* captureContainerIdentity(yield* context(args)))
          : Option.none<ContainerIdentity>();
        const missingDirectories: Array<string> = [];
        let ancestor = path.dirname(physicalPath);
        while (!(yield* fs.exists(ancestor))) {
          missingDirectories.push(ancestor);
          const parent = path.dirname(ancestor);
          if (parent === ancestor)
            return yield* new NativeWriteRefused({ path: args.path, cause: "native-root-absent" });
          ancestor = parent;
        }
        const anchor = yield* captureContainerIdentity({
          nativeRoot: ancestor,
          ownerRoot,
          target: ancestor,
        });
        const receipts = Option.isSome(actual)
          ? yield* validReceipts(actual.value, physicalPath)
          : [];
        return {
          target: args,
          context: selectedContext,
          beforeRaw: actual,
          beforeIdentity,
          anchor: Option.some(anchor),
          physicalPath,
          eligible: args.eligible,
          receipts,
          missingDirectories,
        } satisfies NativeInsertionCapture;
      }),
    );
  const recordInsertion: NativeWriteAuthorityService["recordInsertion"] = ({
    capture,
    afterRaw,
    createdDirectories,
  }) =>
    finish(
      capture.target.path,
      Effect.gen(function* () {
        const actual = yield* currentRaw(capture.target.path);
        if (!Option.contains(actual, afterRaw))
          return yield* new NativeWriteRefused({
            path: capture.target.path,
            cause: "native-content-changed-after-write",
          });
        const identity = yield* captureContainerIdentity(capture.context);
        if (
          identity.physicalPath !== capture.physicalPath ||
          (Option.isSome(capture.beforeIdentity) &&
            !sameRoute(capture.beforeIdentity.value, identity)) ||
          (Option.isSome(capture.anchor) &&
            !(yield* verifyContainerIdentity(
              capture.anchor.value,
              identityContext(capture.anchor.value),
            )))
        ) {
          return yield* new NativeWriteRefused({
            path: capture.target.path,
            cause: "native-route-changed-during-write",
          });
        }
        const refreshed: Array<ContainerReceipt> = [];
        for (const prior of capture.receipts) {
          const nextIdentity = yield* captureContainerIdentity(proofContext(prior));
          if (!sameRoute(prior.identity, nextIdentity))
            return yield* new NativeWriteRefused({
              path: capture.target.path,
              cause: "native-alias-changed-during-write",
            });
          refreshed.push({ ...prior, identity: nextIdentity, contentSha256: digest(afterRaw) });
        }
        if (capture.eligible) {
          const inverse = deriveStructuralInverse(
            Option.getOrElse(capture.beforeRaw, () => ""),
            afterRaw,
          );
          if (Option.isSome(inverse))
            refreshed.push({
              unit: capture.target.unit,
              kind: "inserted-key",
              identity,
              contentSha256: digest(afterRaw),
              absentBefore: Option.isNone(capture.beforeRaw),
              inverse: inverse.value,
            });
          if (Option.isNone(capture.beforeRaw)) {
            refreshed.push({
              unit: capture.target.unit,
              kind: "created-file",
              identity,
              contentSha256: digest(afterRaw),
            });
            for (const directory of createdDirectories) {
              if (
                !capture.missingDirectories.includes(directory.physicalPath) ||
                !(yield* currentIdentity(directory))
              )
                return yield* new NativeWriteRefused({
                  path: capture.target.path,
                  cause: "created-parent-changed-before-record",
                });
              refreshed.push({
                unit: capture.target.unit,
                kind: "created-directory",
                identity: directory,
              });
            }
          }
        }
        yield* updateContainerReceipts(
          location.runtimeDir,
          (entries) => {
            const changed = refreshed.map(
              (receipt) => `${receipt.kind}:${receipt.unit}:${receipt.identity.physicalPath}`,
            );
            return [
              ...entries.filter(
                (receipt) =>
                  !changed.includes(
                    `${receipt.kind}:${receipt.unit}:${receipt.identity.physicalPath}`,
                  ),
              ),
              ...refreshed,
            ];
          },
          mutation,
        );
      }),
    );
  const resolveInsertions: NativeWriteAuthorityService["resolveInsertions"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        if (!Option.contains(yield* currentRaw(args.path), args.raw)) return Option.none();
        const identity = yield* captureContainerIdentity(yield* context(args));
        const receipts = (yield* validReceipts(args.raw, identity.physicalPath)).filter(
          (receipt) =>
            receipt.kind === "inserted-key" &&
            receipt.inverse !== undefined &&
            sameRoute(receipt.identity, identity),
        );
        const remaining = new Set(args.units);
        if (remaining.size === 0) return Option.none();
        let raw = args.raw;
        let absent = false;
        while (remaining.size > 0) {
          const applicable = receipts.flatMap((receipt) => {
            if (!remaining.has(receipt.unit) || receipt.inverse === undefined) return [];
            const restored = applyStructuralInverse(raw, receipt.inverse);
            return Option.isSome(restored) ? [{ receipt, raw: restored.value }] : [];
          });
          const next = applicable[0];
          if (next === undefined || applicable.length !== 1 || absent) return Option.none();
          remaining.delete(next.receipt.unit);
          raw = next.raw;
          absent = next.receipt.absentBefore === true;
        }
        return Option.some(
          absent ? { kind: "remove-file" as const } : { kind: "restore-text" as const, text: raw },
        );
      }),
    );
  const resolveInsertion: NativeWriteAuthorityService["resolveInsertion"] = (args) =>
    resolveInsertions({ ...args, units: [args.unit] });
  const forgetInsertion: NativeWriteAuthorityService["forgetInsertion"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const { address } = yield* authorize(args.path);
        const physicalPath = address.referentPath ?? address.entryPath;
        yield* updateContainerReceipts(
          location.runtimeDir,
          (entries) =>
            entries.filter(
              (receipt) =>
                receipt.unit !== args.unit ||
                receipt.identity.physicalPath !== physicalPath ||
                receipt.kind === "created-file" ||
                receipt.kind === "created-directory",
            ),
          mutation,
        );
      }),
    );
  const retireInsertion: NativeWriteAuthorityService["retireInsertion"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        if (!Option.contains(yield* currentRaw(args.path), args.raw)) return false;
        const identity = yield* captureContainerIdentity(yield* context(args));
        const valid = yield* validReceipts(args.raw, identity.physicalPath);
        if (
          !valid.some(
            (receipt) => receipt.kind === "created-file" && sameRoute(receipt.identity, identity),
          )
        )
          return false;
        if (
          !args.empty &&
          !Option.exists(yield* resolveInsertion(args), (value) => value.kind === "remove-file")
        )
          return false;
        yield* retireWorkspacePath(identity.physicalPath);
        const all = (yield* readContainerReceipts(location.runtimeDir)).entries;
        const retired = new Set([identity.physicalPath]);
        for (const receipt of [...all]
          .filter(
            (entry) =>
              entry.kind === "created-directory" &&
              identity.physicalPath.startsWith(`${entry.identity.physicalPath}${path.sep}`),
          )
          .sort(
            (left, right) => right.identity.physicalPath.length - left.identity.physicalPath.length,
          )) {
          if (!(yield* currentIdentity(receipt.identity))) continue;
          if ((yield* fs.readDirectory(receipt.identity.physicalPath)).length !== 0) continue;
          yield* retireWorkspacePath(receipt.identity.physicalPath, { emptyOnly: true });
          retired.add(receipt.identity.physicalPath);
        }
        yield* updateContainerReceipts(
          location.runtimeDir,
          (entries) => entries.filter((receipt) => !retired.has(receipt.identity.physicalPath)),
          mutation,
        );
        return true;
      }),
    );
  const captureCreatedDirectories: NativeWriteAuthorityService["captureCreatedDirectories"] = (
    args,
  ) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const { address } = yield* authorize(args.path);
        const missingDirectories: string[] = [];
        let ancestor = path.dirname(address.entryPath);
        while (!(yield* fs.exists(ancestor))) {
          missingDirectories.push(ancestor);
          const parent = path.dirname(ancestor);
          if (parent === ancestor)
            return yield* new NativeWriteRefused({ path: args.path, cause: "native-root-absent" });
          ancestor = parent;
        }
        const anchor = yield* captureContainerIdentity({
          nativeRoot: ancestor,
          ownerRoot,
          target: ancestor,
        });
        return {
          target: args,
          physicalPath: address.entryPath,
          anchor,
          missingDirectories,
          eligible: args.eligible && address.kind === "absent",
        };
      }),
    );
  const recordCreatedDirectories: NativeWriteAuthorityService["recordCreatedDirectories"] = ({
    capture,
    createdDirectories,
  }) =>
    finish(
      capture.target.path,
      Effect.gen(function* () {
        if (!capture.eligible || createdDirectories.length === 0) return;
        const { address } = yield* authorize(capture.target.path);
        if (
          address.kind === "absent" ||
          address.entryPath !== capture.physicalPath ||
          !(yield* verifyContainerIdentity(capture.anchor, identityContext(capture.anchor)))
        ) {
          return yield* new NativeWriteRefused({
            path: capture.target.path,
            cause: "native-entry-route-changed-during-creation",
          });
        }
        const added: ContainerReceipt[] = [];
        for (const identity of createdDirectories) {
          if (
            !capture.missingDirectories.includes(identity.physicalPath) ||
            !(yield* currentIdentity(identity))
          )
            return yield* new NativeWriteRefused({
              path: capture.target.path,
              cause: "created-parent-changed-before-record",
            });
          added.push({ unit: capture.target.unit, kind: "created-directory", identity });
        }
        yield* updateContainerReceipts(
          location.runtimeDir,
          (entries) => [...entries, ...added],
          mutation,
        );
      }),
    );
  const retireCreatedDirectories: NativeWriteAuthorityService["retireCreatedDirectories"] = (
    args,
  ) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const { address } = yield* authorize(args.path);
        if (address.kind !== "absent") return;
        const receipts = (yield* readContainerReceipts(location.runtimeDir)).entries;
        const retired = new Set<string>();
        for (const receipt of receipts
          .filter(
            (entry) =>
              entry.kind === "created-directory" &&
              address.entryPath.startsWith(`${entry.identity.physicalPath}${path.sep}`),
          )
          .sort(
            (left, right) => right.identity.physicalPath.length - left.identity.physicalPath.length,
          )) {
          if (
            !(yield* currentIdentity(receipt.identity)) ||
            (yield* fs.readDirectory(receipt.identity.physicalPath)).length !== 0
          )
            continue;
          yield* retireWorkspacePath(receipt.identity.physicalPath, { emptyOnly: true });
          retired.add(receipt.identity.physicalPath);
        }
        if (retired.size > 0)
          yield* updateContainerReceipts(
            location.runtimeDir,
            (entries) => entries.filter((receipt) => !retired.has(receipt.identity.physicalPath)),
            mutation,
          );
      }),
    );
  return {
    authorize: (target: string) => finish(target, authorize(target)),
    createParentDirectories,
    captureInsertion,
    recordInsertion,
    resolveInsertion,
    resolveInsertions,
    forgetInsertion,
    retireInsertion,
    captureCreatedDirectories,
    recordCreatedDirectories,
    retireCreatedDirectories,
  };
});

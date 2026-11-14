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
  NativeEntryRemoval,
  applyDigestedStructuralInverse,
  assertNativeMutationWithinRoots,
  captureNativeAuthorityRoots,
  nativeAuthorityRoots,
  captureContainerIdentity,
  deriveStructuralInverse,
  digestText,
  readContainerReceipts,
  updateContainerReceipts,
  updateContainerReceiptsSequence,
  verifyContainerIdentity,
  type ContainerIdentity,
  type ContainerReceipt,
  type ContainerReceiptMutation,
  type NativeEntryAddress,
} from "../locations/index.js";
import {
  createWorkspaceDirectories,
  createdWorkspaceDirectories,
  protectCreatedAncestors,
  protectWorkspacePath,
  recordFootprint,
  recordFilePublication,
  retireWorkspacePath,
  WorkspaceFileWriteLocks,
} from "../settlement/index.js";
import { WorkspaceLocation } from "../workspace-state/index.js";

type DigestedText = Effect.Success<ReturnType<typeof digestText>>;
type NativeInsertionResolution = Option.Option.Value<
  Effect.Success<ReturnType<NativeWriteAuthorityService["resolveInsertions"]>>
>;
type ReceiptChange = (entries: ReadonlyArray<ContainerReceipt>) => ReadonlyArray<ContainerReceipt>;
const sameRoute = (before: ContainerIdentity, after: ContainerIdentity): boolean => {
  return JSON.stringify(before) === JSON.stringify(after);
};

/** The owning workspace supplies persistence, authority, and transaction capabilities once. */
export const makeNativeInsertionAuthority = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const removal = yield* NativeEntryRemoval;
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
  const contextOf = (args: Omit<NativeInsertionTarget, "unit">, nativeRoot: string) => ({
    nativeRoot,
    ownerRoot,
    target: args.path,
    ...(args.aliases === undefined ? {} : { aliases: args.aliases }),
  });
  const context = (args: Omit<NativeInsertionTarget, "unit">) =>
    Effect.map(authorize(args.path, "content"), ({ nativeRoot }) => contextOf(args, nativeRoot));
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
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | NativeEntryRemoval>,
  ): Effect.Effect<A, NativeWriteRefused> =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(NativeEntryRemoval, removal),
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
    write: (target, contents, prior) =>
      finish(
        target,
        Effect.gen(function* () {
          // Only bytes equal to the locked read can be a no-op; that path re-reads
          // the store after protection so a foreign deletion or replacement heals.
          const heldEqual = Option.contains(prior.text, contents);
          const existed = heldEqual ? yield* fs.exists(target) : Option.isSome(prior.text);
          yield* authorize(target);
          yield* protectCreatedAncestors(fs, path, path.dirname(target));
          yield* protectWorkspacePath(target);
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* writeFileAtomic(fs, {
            targetPath: target,
            content: contents,
            ...(heldEqual ? { skipIfUnchanged: "ignore-read-errors" as const } : {}),
            onPublished: (publication) =>
              recordFilePublication(
                { path: target, change: existed ? "modified" : "created" },
                publication,
              ),
            mapError: (cause) => new NativeWriteRefused({ path: target, cause }),
          });
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
  /** Read the content an admission just addressed. */
  const readAdmitted = (target: string, address: NativeEntryAddress) =>
    Effect.gen(function* () {
      if (address.kind === "absent") return Option.none<string>();
      if (address.referentPath === undefined)
        return yield* new NativeWriteRefused({ path: target, cause: "unreadable-native-content" });
      return Option.some(yield* fs.readFileString(address.referentPath));
    });
  const currentRaw = (target: string) =>
    Effect.flatMap(authorize(target, "content"), ({ address }) => readAdmitted(target, address));
  const proofContext = (receipt: ContainerReceipt) => identityContext(receipt.identity);
  /**
   * Receipts whose digest matches the current text and whose identity is live.
   * The digest runs only when some receipt addresses the path, and each distinct
   * stored identity is proven live once within this one call.
   */
  const validReceipts = (current: Effect.Effect<DigestedText>, physicalPath: string) =>
    Effect.gen(function* () {
      const entries = (yield* readContainerReceipts(location.runtimeDir)).entries;
      const valid: Array<ContainerReceipt> = [];
      const verdicts = new Map<string, boolean>();
      for (const receipt of entries) {
        if (
          receipt.identity.physicalPath !== physicalPath ||
          receipt.contentSha256 !== (yield* current).sha256
        )
          continue;
        const key = JSON.stringify(receipt.identity);
        const known = verdicts.get(key);
        const verdict = known ?? (yield* currentIdentity(receipt.identity));
        if (known === undefined) verdicts.set(key, verdict);
        if (verdict) valid.push(receipt);
      }
      return valid;
    });
  const captureInsertion: NativeWriteAuthorityService["captureInsertion"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const { address, nativeRoot } = yield* authorize(args.path, "content");
        const selectedContext = contextOf(args, nativeRoot);
        const actual = yield* readAdmitted(args.path, address);
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
          ? yield* validReceipts(yield* Effect.cached(digestText(actual.value)), physicalPath)
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
  /** Drop `unit`'s receipts on `physicalPath`, keeping created-file and created-directory proofs. */
  const forgetUnit =
    (unit: string, physicalPath: string): ReceiptChange =>
    (entries) =>
      entries.filter(
        (receipt) =>
          receipt.unit !== unit ||
          receipt.identity.physicalPath !== physicalPath ||
          receipt.kind === "created-file" ||
          receipt.kind === "created-directory",
      );
  /** The entry-mode admission a forget addresses its receipts through. */
  const forgetPath = (target: string) =>
    Effect.map(authorize(target), ({ address }) => address.referentPath ?? address.entryPath);
  const forgetUnits = (units: ReadonlyArray<string>, physicalPath: string) =>
    updateContainerReceiptsSequence(
      location.runtimeDir,
      units.map((unit) => forgetUnit(unit, physicalPath)),
      mutation,
    );
  const recordInsertion: NativeWriteAuthorityService["recordInsertion"] = ({
    capture,
    afterRaw,
    createdDirectories,
    forgetUnits: forgotten = [],
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
        // One post-write recapture per distinct stored prior identity in this
        // call; an identity is remembered only after its sameRoute check passed.
        const recaptured = new Map<string, ContainerIdentity>();
        const priors: Array<{
          readonly prior: ContainerReceipt;
          readonly nextIdentity: ContainerIdentity;
        }> = [];
        for (const prior of capture.receipts) {
          const key = JSON.stringify(prior.identity);
          let nextIdentity = recaptured.get(key);
          if (nextIdentity === undefined) {
            nextIdentity = yield* captureContainerIdentity(proofContext(prior));
            if (!sameRoute(prior.identity, nextIdentity))
              return yield* new NativeWriteRefused({
                path: capture.target.path,
                cause: "native-alias-changed-during-write",
              });
            recaptured.set(key, nextIdentity);
          }
          priors.push({ prior, nextIdentity: structuredClone(nextIdentity) });
        }
        const inverse = capture.eligible
          ? yield* deriveStructuralInverse(
              Option.getOrElse(capture.beforeRaw, () => ""),
              afterRaw,
            )
          : Option.none();
        const created: Array<ContainerIdentity> = [];
        if (capture.eligible && Option.isNone(capture.beforeRaw))
          for (const directory of createdDirectories) {
            if (
              !capture.missingDirectories.includes(directory.physicalPath) ||
              !(yield* currentIdentity(directory))
            )
              return yield* new NativeWriteRefused({
                path: capture.target.path,
                cause: "created-parent-changed-before-record",
              });
            created.push(directory);
          }
        // The derived inverse already hashed exactly `afterRaw`.
        const afterDigest = yield* Effect.cached(digestText(afterRaw));
        const contentSha256 = Option.isSome(inverse)
          ? Effect.succeed(inverse.value.afterSha256)
          : Effect.map(afterDigest, (text) => text.sha256);
        const refreshed: Array<ContainerReceipt> = [];
        for (const { prior, nextIdentity } of priors)
          refreshed.push({ ...prior, identity: nextIdentity, contentSha256: yield* contentSha256 });
        if (capture.eligible) {
          if (Option.isSome(inverse))
            refreshed.push({
              unit: capture.target.unit,
              kind: "inserted-key",
              identity,
              contentSha256: yield* contentSha256,
              absentBefore: Option.isNone(capture.beforeRaw),
              inverse: inverse.value,
            });
          if (Option.isNone(capture.beforeRaw)) {
            refreshed.push({
              unit: capture.target.unit,
              kind: "created-file",
              identity,
              contentSha256: yield* contentSha256,
            });
            for (const directory of created)
              refreshed.push({
                unit: capture.target.unit,
                kind: "created-directory",
                identity: directory,
              });
          }
        }
        const record: ReceiptChange = (entries) => {
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
        };
        if (forgotten.length === 0)
          return yield* updateContainerReceipts(location.runtimeDir, record, mutation);
        // The forget keeps its own entry-mode admission. Only when it addresses
        // the verified container do the record and the forgets share one update.
        const forgetAt = yield* Effect.result(forgetPath(capture.target.path));
        if (forgetAt._tag === "Success" && forgetAt.success === capture.physicalPath)
          return yield* updateContainerReceiptsSequence(
            location.runtimeDir,
            [record, ...forgotten.map((unit) => forgetUnit(unit, forgetAt.success))],
            mutation,
          );
        yield* updateContainerReceipts(location.runtimeDir, record, mutation);
        if (forgetAt._tag === "Failure") return yield* Effect.fail(forgetAt.failure);
        yield* forgetUnits(forgotten, forgetAt.success);
      }),
    );
  /**
   * The live gate withdrawal decisions share: the current text must still be
   * the caller's bytes (absent is not empty), then the container identity is
   * captured and the receipts valid for that text are proven.
   */
  const liveInsertionState = (
    args: Omit<NativeInsertionTarget, "unit"> & { readonly raw: string },
  ) =>
    Effect.gen(function* () {
      if (!Option.contains(yield* currentRaw(args.path), args.raw)) return Option.none();
      const identity = yield* captureContainerIdentity(yield* context(args));
      const rawDigest = yield* Effect.cached(digestText(args.raw));
      const receipts = yield* validReceipts(rawDigest, identity.physicalPath);
      return Option.some({ identity, rawDigest, receipts });
    });
  type LiveInsertionState = Option.Option.Value<
    Effect.Success<ReturnType<typeof liveInsertionState>>
  >;
  /** Undo `units` through exactly one applicable inverse per round over one gate's state. */
  const resolveFrom = (state: LiveInsertionState, units: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const receipts = state.receipts.filter(
        (receipt) =>
          receipt.kind === "inserted-key" &&
          receipt.inverse !== undefined &&
          sameRoute(receipt.identity, state.identity),
      );
      const remaining = new Set(units);
      if (remaining.size === 0) return Option.none<NativeInsertionResolution>();
      // Round one reuses the current text's digest; later rounds use the
      // restored text already bound to the digest its inverse just verified.
      let current: Effect.Effect<DigestedText> = state.rawDigest;
      let absent = false;
      while (remaining.size > 0) {
        const applicable: Array<{
          readonly receipt: ContainerReceipt;
          readonly text: DigestedText;
        }> = [];
        for (const receipt of receipts) {
          if (!remaining.has(receipt.unit) || receipt.inverse === undefined) continue;
          const restored = yield* applyDigestedStructuralInverse(yield* current, receipt.inverse);
          if (Option.isSome(restored)) applicable.push({ receipt, text: restored.value });
        }
        const next = applicable[0];
        if (next === undefined || applicable.length !== 1 || absent)
          return Option.none<NativeInsertionResolution>();
        remaining.delete(next.receipt.unit);
        current = Effect.succeed(next.text);
        absent = next.receipt.absentBefore === true;
      }
      const restored = yield* current;
      return Option.some<NativeInsertionResolution>(
        absent ? { kind: "remove-file" } : { kind: "restore-text", text: restored.raw },
      );
    });
  /**
   * Retire a created file proven by one gate's state. Without the format
   * owner's emptiness proof, the single unit's own resolution must remove it.
   */
  const retireFrom = (
    state: LiveInsertionState,
    args: { readonly unit: string; readonly empty: boolean },
  ) =>
    Effect.gen(function* () {
      const { identity } = state;
      if (
        !state.receipts.some(
          (receipt) => receipt.kind === "created-file" && sameRoute(receipt.identity, identity),
        )
      )
        return false;
      if (
        !args.empty &&
        !Option.exists(
          yield* resolveFrom(state, [args.unit]),
          (value) => value.kind === "remove-file",
        )
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
    });
  const resolveInsertions: NativeWriteAuthorityService["resolveInsertions"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const state = yield* liveInsertionState(args);
        return Option.isSome(state) ? yield* resolveFrom(state.value, args.units) : Option.none();
      }),
    );
  const resolveInsertion: NativeWriteAuthorityService["resolveInsertion"] = (args) =>
    resolveInsertions({ ...args, units: [args.unit] });
  const withdrawInsertions: NativeWriteAuthorityService["withdrawInsertions"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const state = yield* liveInsertionState(args);
        if (Option.isNone(state)) return { resolution: Option.none(), retired: false };
        const resolution = yield* resolveFrom(state.value, args.units);
        const retired =
          (args.retire.renderedEmpty ||
            Option.exists(resolution, (value) => value.kind === "remove-file")) &&
          (yield* retireFrom(state.value, args.retire));
        return { resolution, retired };
      }),
    );
  const forgetInsertions: NativeWriteAuthorityService["forgetInsertions"] = (args) =>
    finish(
      args.path,
      Effect.flatMap(forgetPath(args.path), (physicalPath) =>
        forgetUnits(args.units, physicalPath),
      ),
    );
  const forgetInsertion: NativeWriteAuthorityService["forgetInsertion"] = (args) =>
    forgetInsertions({ ...args, units: [args.unit] });
  const retireInsertion: NativeWriteAuthorityService["retireInsertion"] = (args) =>
    finish(
      args.path,
      Effect.gen(function* () {
        const state = yield* liveInsertionState(args);
        return Option.isSome(state) && (yield* retireFrom(state.value, args));
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
    withdrawInsertions,
    forgetInsertion,
    forgetInsertions,
    retireInsertion,
    captureCreatedDirectories,
    recordCreatedDirectories,
    retireCreatedDirectories,
  };
});

/** Exact document restoration under a continuing physical identity and postimage. */
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Ref from "effect/Ref";
import * as Equal from "effect/Equal";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { writeFileAtomic } from "@agentxm/host-primitives";
import {
  applyStructuralInverse,
  assertNativeMutationWithin,
  captureContainerIdentity,
  deriveStructuralInverse,
  readContainerReceipts,
  updateContainerReceipts,
  verifyContainerIdentity,
  type ContainerReceipt,
  type ContainerReceiptMutation,
} from "../../locations/index.js";
import {
  createdWorkspaceDirectories,
  protectCreatedAncestors,
  protectWorkspacePath,
  recordFootprint,
  retireWorkspacePath,
  type WorkspaceFileWriteLocksService,
} from "../../settlement/index.js";

export interface DocumentRoundTripContext {
  readonly nativeRoot: string;
  readonly runtimeDir: string;
  readonly eligible: boolean;
  readonly locks: WorkspaceFileWriteLocksService;
}

/** One explicit graph introduction/withdrawal may publish its document in several steps. */
export interface DocumentRoundTripBatch {
  readonly identity: string;
  readonly mode: "introduce" | "withdraw";
}
interface ActiveDocumentBatch extends DocumentRoundTripBatch {
  readonly visited: Ref.Ref<ReadonlySet<string>>;
}
const CurrentDocumentBatch = Context.Reference<ActiveDocumentBatch | undefined>(
  "@agentxm/workspace-kernel/CurrentDocumentRoundTripBatch",
  { defaultValue: () => undefined },
);

export const withDocumentRoundTripBatch = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  batch: DocumentRoundTripBatch | undefined,
): Effect.Effect<A, E, R> =>
  batch === undefined
    ? effect
    : Effect.gen(function* () {
        const visited = yield* Ref.make<ReadonlySet<string>>(new Set());
        return yield* effect.pipe(
          Effect.provideService(CurrentDocumentBatch, { ...batch, visited }),
        );
      });

export const prepareDocumentRoundTrip = <E>(args: {
  readonly context: DocumentRoundTripContext;
  readonly target: string;
  readonly before: string | undefined;
  readonly after: string;
  readonly unitPrefix: string;
  readonly insertions: ReadonlyArray<string>;
  readonly withdrawals: ReadonlyArray<string>;
  readonly acceptRestored: (raw: string) => boolean;
  readonly acceptAbsent?: boolean;
  readonly mapFailure: (target: string, cause: unknown) => E;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const locks = args.context.locks;
    const proof = {
      nativeRoot: args.context.nativeRoot,
      ownerRoot: path.dirname(args.context.runtimeDir),
      target: args.target,
    };
    const address = yield* assertNativeMutationWithin(
      proof.nativeRoot,
      proof.target,
      "content",
      proof.ownerRoot,
    );
    const physicalPath = address.referentPath ?? address.entryPath;
    const priorIdentity =
      args.before === undefined ? undefined : yield* captureContainerIdentity(proof);
    const parentProof = { ...proof, target: path.dirname(args.target) };
    const parentIdentity =
      args.before === undefined ? yield* captureContainerIdentity(parentProof) : undefined;
    const stored = (yield* readContainerReceipts(args.context.runtimeDir)).entries.filter(
      (receipt) =>
        receipt.unit.startsWith(args.unitPrefix) && receipt.identity.physicalPath === physicalPath,
    );
    const batch = yield* CurrentDocumentBatch;
    const batchUnit =
      batch === undefined
        ? undefined
        : `${args.unitPrefix}"closure",${JSON.stringify(batch.identity)}]`;
    const batchContinues = batch !== undefined && (yield* Ref.get(batch.visited)).has(physicalPath);
    let batchBaseline: string | undefined;
    let batchAbsent = false;
    let batchProven = false;
    if (batch !== undefined && batchUnit !== undefined) {
      if (
        batch.mode === "introduce" &&
        !batchContinues &&
        args.insertions.length > 0 &&
        args.withdrawals.length === 0
      ) {
        batchBaseline = args.before ?? "";
        batchAbsent = args.before === undefined;
        batchProven = true;
      } else if (
        args.before !== undefined &&
        (batch.mode === "introduce"
          ? batchContinues && args.insertions.length > 0 && args.withdrawals.length === 0
          : args.insertions.length === 0 && args.withdrawals.length > 0)
      ) {
        const receipt = stored.find((item) => item.unit === batchUnit);
        if (
          receipt?.inverse !== undefined &&
          (yield* verifyContainerIdentity(receipt.identity, proof))
        ) {
          const restored = applyStructuralInverse(args.before, receipt.inverse);
          if (Option.isSome(restored)) {
            batchBaseline = restored.value;
            batchAbsent = receipt.absentBefore === true;
            batchProven = true;
          }
        }
      }
    }
    let content = args.after;
    let remove = false;
    if (batch?.mode === "withdraw" && batchProven && batchBaseline !== undefined) {
      if (args.acceptRestored(batchBaseline)) content = batchBaseline;
      if (batchAbsent && batchBaseline === "" && args.acceptAbsent === true) remove = true;
    }
    if (
      batch === undefined &&
      args.before !== undefined &&
      args.withdrawals.length === 1 &&
      args.insertions.length === 0
    )
      for (const receipt of stored) {
        if (
          !args.withdrawals.includes(receipt.unit) ||
          receipt.inverse === undefined ||
          !(yield* verifyContainerIdentity(receipt.identity, proof))
        )
          continue;
        const restored = applyStructuralInverse(args.before, receipt.inverse);
        if (Option.isSome(restored) && args.acceptRestored(restored.value))
          content = restored.value;
        if (
          Option.isSome(restored) &&
          restored.value === "" &&
          receipt.kind === "created-file" &&
          receipt.absentBefore === true &&
          args.acceptAbsent === true
        )
          remove = true;
      }
    const mapFailure = args.mapFailure;
    const mutation: ContainerReceiptMutation<E, never> = {
      inheritedDirectories: createdWorkspaceDirectories,
      withLock: (target, effect) =>
        locks
          .withLock(target, effect)
          .pipe(
            Effect.catchTag("WorkspaceSnapshotError", (cause) =>
              Effect.fail(mapFailure(target, cause)),
            ),
          ),
      createDirectory: (target) =>
        Effect.uninterruptible(
          Effect.gen(function* () {
            yield* assertNativeMutationWithin(
              args.context.nativeRoot,
              target,
              "entry",
              path.dirname(args.context.runtimeDir),
            );
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
        ).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) => mapFailure(target, cause)),
        ),
      write: (target, text) =>
        Effect.gen(function* () {
          yield* assertNativeMutationWithin(
            args.context.nativeRoot,
            target,
            "entry",
            path.dirname(args.context.runtimeDir),
          );
          const existed = yield* fs.exists(target);
          yield* protectCreatedAncestors(fs, path, path.dirname(target));
          yield* protectWorkspacePath(target);
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* writeFileAtomic(fs, {
            targetPath: target,
            content: text,
            skipIfUnchanged: "ignore-read-errors",
            mapError: (cause) => mapFailure(target, cause),
          });
          yield* recordFootprint({ path: target, change: existed ? "modified" : "created" });
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) => mapFailure(target, cause)),
        ),
      retire: (target) =>
        Effect.gen(function* () {
          const info = yield* fs.stat(target);
          yield* retireWorkspacePath(target, { emptyOnly: info.type === "Directory" });
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) => mapFailure(target, cause)),
        ),
    };
    const finalContent = content;
    const removeTarget = remove;
    const revalidate = Effect.gen(function* () {
      const current =
        priorIdentity === undefined
          ? !(yield* fs.exists(args.target)) &&
            parentIdentity !== undefined &&
            (yield* verifyContainerIdentity(parentIdentity, parentProof))
          : (yield* verifyContainerIdentity(priorIdentity, proof)) &&
            (yield* fs.readFileString(args.target)) === args.before;
      if (!current) {
        return yield* Effect.fail(mapFailure(args.target, "document-changed-before-publication"));
      }
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.mapError((cause) => mapFailure(args.target, cause)),
    );
    const finish = Effect.gen(function* () {
      const receipts: ContainerReceipt[] = [];
      if (removeTarget) {
        if (yield* fs.exists(args.target))
          return yield* Effect.fail(mapFailure(args.target, "retired-document-reappeared"));
      } else {
        const identity = yield* captureContainerIdentity(proof);
        let sameRoute: boolean;
        if (priorIdentity === undefined) {
          sameRoute =
            parentIdentity !== undefined &&
            identity.physicalPath === physicalPath &&
            (yield* verifyContainerIdentity(parentIdentity, parentProof));
        } else {
          const { entry: _beforeEntry, ...beforeRoute } = priorIdentity;
          const { entry: _afterEntry, ...afterRoute } = identity;
          sameRoute = Equal.equals(beforeRoute, afterRoute);
        }
        if (!sameRoute || (yield* fs.readFileString(args.target)) !== finalContent) {
          return yield* Effect.fail(
            mapFailure(args.target, "document-route-or-content-changed-during-publication"),
          );
        }
        const inserted = args.insertions[0];
        const baseline = batch === undefined ? (args.before ?? "") : batchBaseline;
        const absentBefore = batch === undefined ? args.before === undefined : batchAbsent;
        const inverse =
          baseline === undefined ? Option.none() : deriveStructuralInverse(baseline, finalContent);
        const unit = batch === undefined ? inserted : batchUnit;
        const eligible =
          batch === undefined
            ? args.context.eligible && args.insertions.length === 1 && args.withdrawals.length === 0
            : batchProven;
        if (eligible && unit !== undefined && Option.isSome(inverse)) {
          receipts.push({
            unit,
            kind: absentBefore ? "created-file" : "inserted-key",
            identity,
            inverse: inverse.value,
            ...(absentBefore ? { absentBefore: true } : {}),
          });
        }
      }
      if (batch !== undefined)
        yield* Ref.update(batch.visited, (visited) => new Set([...visited, physicalPath]));
      // A different command or unrelated document change expires the exact baseline.
      yield* updateContainerReceipts(
        args.context.runtimeDir,
        (current) => [
          ...current.filter(
            (receipt) =>
              !receipt.unit.startsWith(args.unitPrefix) ||
              receipt.identity.physicalPath !== physicalPath,
          ),
          ...receipts,
        ],
        mutation,
      );
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.mapError((cause) => mapFailure(args.target, cause)),
    );
    return { content: finalContent, remove: removeTarget, revalidate, finish };
  }).pipe(Effect.mapError((cause) => args.mapFailure(args.target, cause)));

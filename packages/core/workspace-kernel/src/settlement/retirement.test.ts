/**
 * Retirement cleanup at settlement: a retired original is discarded only when
 * its quarantine store and the retained entry still match what retirement
 * recorded. Retirement itself refuses an entry that changed after its
 * protection, whichever observation detects it. Real temporary directories
 * supply the identities compared.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { resolveNativeReferent } from "../locations/index.js";
import { CanonicalNativePathLive } from "../locations/live.js";
import { NativePlatformTest } from "../locations/testing.js";
import { CurrentWorkspaceTransaction } from "./context.js";
import { WorkspaceRestorationError, WorkspaceSnapshotError } from "./errors.js";
import {
  FootprintRecorder,
  makeFootprintRecorder,
  protectWorkspacePath,
  readFootprint,
  retireWorkspacePath,
  runWorkspaceTransaction,
} from "./index.js";
import { observePathState } from "./path-state.js";
import { injectWriteFaults, WorkspaceTransactionScopeTest } from "./testing.js";

const platform = Layer.merge(NativePlatformTest, CanonicalNativePathLive);
const privileged = process.platform === "win32" || process.getuid?.() === 0;

interface Retired {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly root: string;
  readonly store: string;
  readonly entry: string;
}

/**
 * Retire `<root>/<name>` (created by `create`) in a transaction that commits,
 * applying `beforeSettlement` once the transition has completed. `wrap` may
 * substitute the filesystem the transaction uses.
 */
const retireAndSettle = (
  name: string,
  create: (fs: FileSystem.FileSystem, target: string) => Effect.Effect<void, unknown>,
  beforeSettlement: (retired: Retired) => Effect.Effect<void, unknown>,
  wrap: (fs: FileSystem.FileSystem, retired: () => Retired | undefined) => FileSystem.FileSystem = (
    fs,
  ) => fs,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs
      .makeTempDirectoryScoped({ prefix: "axm-retirement-" })
      .pipe(Effect.flatMap(resolveNativeReferent));
    yield* fs.makeDirectory(path.join(root, ".axm"));
    const target = path.join(root, name);
    yield* create(fs, target).pipe(Effect.orDie);
    let retired: Retired | undefined;
    const transactionFs = wrap(fs, () => retired);
    const result = yield* runWorkspaceTransaction({
      claimDefaultTargets: false,
      transition: Effect.gen(function* () {
        yield* retireWorkspacePath(target);
        const storeName = (yield* fs.readDirectory(root)).find((entry) =>
          entry.startsWith(".axm-retired-"),
        );
        if (storeName === undefined) return yield* Effect.die("Expected a retirement store");
        const store = path.join(root, storeName);
        retired = { fs, path, root, store, entry: path.join(store, "entry") };
      }),
      validate: () =>
        retired === undefined ? Effect.void : beforeSettlement(retired).pipe(Effect.orDie),
    }).pipe(
      Effect.provide(
        WorkspaceTransactionScopeTest({
          workspaceDir: path.join(root, ".axm"),
          settingsPath: path.join(root, "axm.json"),
          lockPath: path.join(root, "axm.lock"),
        }),
      ),
      Effect.provideService(FileSystem.FileSystem, transactionFs),
      Effect.result,
    );
    if (retired === undefined) return yield* Effect.die("Expected a retired entry");
    return { ...retired, target, result };
  });

const directoryWithFiles = (fs: FileSystem.FileSystem, target: string) =>
  Effect.gen(function* () {
    yield* fs.makeDirectory(target);
    yield* fs.writeFileString(`${target}/f1`, "f1");
    yield* fs.writeFileString(`${target}/f2`, "f2");
  });

/** Cleanup refusal: the named path is retained and reported. */
const expectRetained = Effect.fnUntraced(function* (
  settled: Effect.Success<ReturnType<typeof retireAndSettle>>,
  retained: string,
) {
  const result = settled.result;
  if (result._tag !== "Failure" || result.failure._tag !== "WorkspaceRestorationIncomplete")
    return expect.fail("Expected retained recovery evidence");
  const cause = result.failure.restorationCause;
  expect(cause).toBeInstanceOf(WorkspaceRestorationError);
  if (cause instanceof WorkspaceRestorationError) {
    expect(cause.step).toBe("foreign-change");
    expect(cause.retained).toEqual([retained]);
  }
  expect(result.failure.retained).toEqual([settled.path.relative(settled.root, retained)]);
  // The protected boundary's copied snapshot and the retained original.
  expect(
    result.failure.recovery.map(({ kind, originalPath, recoveryPath }) => ({
      kind,
      originalPath,
      recoveryPath: kind === "retired-entry" ? recoveryPath : undefined,
    })),
  ).toEqual([
    { kind: "snapshot", originalPath: settled.target, recoveryPath: undefined },
    { kind: "retired-entry", originalPath: settled.target, recoveryPath: settled.entry },
  ]);
  if (result.failure.snapshotDir !== undefined)
    yield* settled.fs.remove(result.failure.snapshotDir, { recursive: true });
});

describe("retirement cleanup", () => {
  it.effect("retains a store that gained a foreign file", () =>
    Effect.gen(function* () {
      const settled = yield* retireAndSettle("D", directoryWithFiles, ({ fs, store }) =>
        fs.writeFileString(`${store}/foreign`, "keep"),
      );
      yield* expectRetained(settled, settled.store);
      expect((yield* settled.fs.readDirectory(settled.store)).sort()).toEqual(["entry", "foreign"]);
      expect(yield* settled.fs.readFileString(`${settled.entry}/f1`)).toBe("f1");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("retains a retired original modified before settlement", () =>
    Effect.gen(function* () {
      const settled = yield* retireAndSettle("D", directoryWithFiles, ({ fs, entry }) =>
        fs.writeFileString(`${entry}/f2`, "changed"),
      );
      yield* expectRetained(settled, settled.entry);
      expect(yield* settled.fs.readFileString(`${settled.entry}/f2`)).toBe("changed");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("removes a store whose entry is already gone", () =>
    Effect.gen(function* () {
      const settled = yield* retireAndSettle("D", directoryWithFiles, ({ fs, entry }) =>
        fs.remove(entry, { recursive: true }),
      );
      expect(settled.result._tag).toBe("Success");
      expect(yield* settled.fs.exists(settled.store)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("discards a retired symlink", () =>
    Effect.gen(function* () {
      const settled = yield* retireAndSettle(
        "link",
        (fs, target) => fs.symlink("missing-referent", target),
        () => Effect.void,
      );
      expect(settled.result._tag).toBe("Success");
      expect(yield* settled.fs.exists(settled.store)).toBe(false);
      expect(yield* settled.fs.readLink(settled.target).pipe(Effect.option)).toEqual(
        expect.objectContaining({ _tag: "None" }),
      );
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect.skipIf(privileged)("retains a retired original that became unreadable", () =>
    Effect.gen(function* () {
      const settled = yield* retireAndSettle("D", directoryWithFiles, ({ fs, entry }) =>
        fs.chmod(entry, 0o000),
      );
      yield* settled.fs.chmod(settled.entry, 0o700);
      yield* expectRetained(settled, settled.entry);
      expect(yield* settled.fs.readFileString(`${settled.entry}/f1`)).toBe("f1");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("retains a retired file edited while cleanup lists the store", () =>
    Effect.gen(function* () {
      let armed = false;
      const settled = yield* retireAndSettle(
        "D",
        directoryWithFiles,
        () =>
          Effect.sync(() => {
            armed = true;
          }),
        (fs, retired) => ({
          ...fs,
          readDirectory: (directory, options) =>
            fs.readDirectory(directory, options).pipe(
              Effect.tap(() => {
                const current = retired();
                if (!armed || current === undefined || directory !== current.store)
                  return Effect.void;
                armed = false;
                return fs.writeFileString(`${current.entry}/f1`, "foreign edit");
              }),
            ),
        }),
      );
      expect(armed).toBe(false);
      yield* expectRetained(settled, settled.entry);
      expect(yield* settled.fs.readFileString(`${settled.entry}/f1`)).toBe("foreign edit");
      expect(yield* settled.fs.readFileString(`${settled.entry}/f2`)).toBe("f2");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

/** A workspace root whose transactions run over a substituted filesystem. */
const raceWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs
    .makeTempDirectoryScoped({ prefix: "axm-retirement-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  yield* fs.makeDirectory(path.join(root, ".axm"));
  const footprint = yield* makeFootprintRecorder;
  const transact = <A, E, R>(
    transactionFs: FileSystem.FileSystem,
    transition: Effect.Effect<A, E, R>,
  ) =>
    runWorkspaceTransaction({
      claimDefaultTargets: false,
      transition,
      validate: () => Effect.void,
    }).pipe(
      Effect.provide(
        WorkspaceTransactionScopeTest({
          workspaceDir: path.join(root, ".axm"),
          settingsPath: path.join(root, "axm.json"),
          lockPath: path.join(root, "axm.lock"),
        }),
      ),
      Effect.provideService(FileSystem.FileSystem, transactionFs),
      Effect.provideService(FootprintRecorder, footprint),
      Effect.exit,
    );
  const stores = fs
    .readDirectory(root)
    .pipe(Effect.map((entries) => entries.filter((entry) => entry.startsWith(".axm-retired-"))));
  return { fs, path, root, transact, stores };
});

/** Runs `act` once, right after the protection copies `source` into its snapshot. */
const afterCopyOf = (
  fs: FileSystem.FileSystem,
  source: string,
  act: Effect.Effect<void, unknown>,
): FileSystem.FileSystem => {
  let armed = true;
  return {
    ...fs,
    copy: (from, to, options) =>
      fs.copy(from, to, options).pipe(
        Effect.tap(() => {
          if (!armed || from !== source) return Effect.void;
          armed = false;
          return act.pipe(Effect.orDie);
        }),
      ),
  };
};

const currentLedger = Effect.gen(function* () {
  const current = yield* CurrentWorkspaceTransaction;
  if (Option.isNone(current)) return yield* Effect.die("Expected an active transaction");
  return yield* SynchronizedRef.get(current.value.ledger);
});

const failureOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined;

describe("retirement after a foreign change since protection", () => {
  it.effect("refuses a deleted target and keeps its snapshot for recovery", () =>
    Effect.gen(function* () {
      const { fs, path, root, transact } = yield* raceWorkspace;
      const target = path.join(root, "D");
      yield* directoryWithFiles(fs, target);
      const observed = yield* observePathState(fs, path, target);
      let failure: WorkspaceSnapshotError | undefined;
      let expected: ReadonlyArray<readonly [string, string]> = [];
      const exit = yield* transact(
        afterCopyOf(fs, target, fs.remove(target, { recursive: true })),
        Effect.gen(function* () {
          failure = yield* retireWorkspacePath(target).pipe(Effect.flip);
          const ledger = yield* currentLedger;
          expected = [
            ...(ledger.snapshots.find((snapshot) => snapshot.target === target)?.expected ?? []),
          ];
          expect(yield* readFootprint).toEqual([]);
          return yield* failure;
        }),
      );
      expect([failure?.step, failure?.cause]).toEqual(["inspect-target", "foreign-change"]);
      expect(expected).toEqual([...observed]);
      // Rollback refuses to recreate the deleted target over a foreign change.
      const result = failureOf(exit);
      if (result?._tag !== "WorkspaceRestorationIncomplete")
        return expect.fail("Expected retained recovery evidence");
      expect(result.recovery.map(({ kind, originalPath }) => ({ kind, originalPath }))).toEqual([
        { kind: "snapshot", originalPath: target },
      ]);
      const recovery = result.recovery[0]?.recoveryPath ?? "";
      expect(yield* fs.readFileString(path.join(recovery, "f1"))).toBe("f1");
      expect(yield* fs.exists(target)).toBe(false);
      if (result.snapshotDir !== undefined)
        yield* fs.remove(result.snapshotDir, { recursive: true });
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses a previously absent target created after protection and preserves it", () =>
    Effect.gen(function* () {
      const { fs, path, root, transact } = yield* raceWorkspace;
      const target = path.join(root, "T");
      let armed = true;
      const creating: FileSystem.FileSystem = {
        ...fs,
        exists: (file) =>
          fs.exists(file).pipe(
            Effect.tap((present) => {
              if (!armed || present || file !== target) return Effect.void;
              armed = false;
              return fs.writeFileString(target, "foreign\n").pipe(Effect.orDie);
            }),
          ),
      };
      let failure: WorkspaceSnapshotError | undefined;
      const exit = yield* transact(
        creating,
        Effect.gen(function* () {
          failure = yield* retireWorkspacePath(target).pipe(Effect.flip);
          return yield* failure;
        }),
      );
      expect(armed).toBe(false);
      expect([failure?.step, failure?.cause]).toEqual(["inspect-target", "foreign-change"]);
      // Restoring the protected absence would discard the foreign file.
      expect(failureOf(exit)?._tag).toBe("WorkspaceRestorationIncomplete");
      expect(yield* fs.readFileString(target)).toBe("foreign\n");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  for (const change of ["emptied", "replaced by a file", "unchanged"] as const) {
    it.effect(`reports an empty-only directory ${change} after protection`, () =>
      Effect.gen(function* () {
        const { fs, path, root, transact, stores } = yield* raceWorkspace;
        const target = path.join(root, "D");
        yield* directoryWithFiles(fs, target);
        const act =
          change === "emptied"
            ? Effect.all([fs.remove(path.join(target, "f1")), fs.remove(path.join(target, "f2"))])
            : change === "replaced by a file"
              ? fs
                  .remove(target, { recursive: true })
                  .pipe(Effect.andThen(fs.writeFileString(target, "foreign\n")))
              : Effect.void;
        let failure: WorkspaceSnapshotError | undefined;
        yield* transact(
          afterCopyOf(fs, target, act),
          Effect.gen(function* () {
            failure = yield* retireWorkspacePath(target, { emptyOnly: true }).pipe(Effect.flip);
          }),
        );
        // A foreign change takes precedence over the empty-only refusal.
        expect([failure?.step, failure?.cause]).toEqual([
          "inspect-target",
          change === "unchanged" ? "directory-not-empty" : "foreign-change",
        ]);
        expect(yield* stores).toEqual([]);
        expect(yield* fs.exists(target)).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect("refuses a same-kind edit before the rename and removes the store", () =>
    Effect.gen(function* () {
      const { fs, path, root, transact, stores } = yield* raceWorkspace;
      const target = path.join(root, "D");
      yield* directoryWithFiles(fs, target);
      const created: Array<string> = [];
      const editing = afterCopyOf(
        fs,
        target,
        fs.writeFileString(path.join(target, "f1"), "foreign"),
      );
      let failure: WorkspaceSnapshotError | undefined;
      yield* transact(
        {
          ...editing,
          makeTempDirectory: (options) =>
            editing
              .makeTempDirectory(options)
              .pipe(Effect.tap((store) => Effect.sync(() => created.push(store)))),
        },
        Effect.gen(function* () {
          failure = yield* retireWorkspacePath(target).pipe(Effect.flip);
        }),
      );
      expect([failure?.step, failure?.cause]).toEqual(["inspect-target", "foreign-change"]);
      // The quarantine store existed, so the check before the rename refused.
      expect(
        created.filter((store) => path.basename(store).startsWith(".axm-retired-")),
      ).toHaveLength(1);
      expect(yield* stores).toEqual([]);
      expect(yield* fs.readFileString(path.join(target, "f1"))).toBe("foreign");
      expect(yield* fs.readFileString(path.join(target, "f2"))).toBe("f2");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  for (const change of ["edited", "unchanged"] as const) {
    it.effect(`reports an unreadable quarantine store of a target ${change} after protection`, () =>
      Effect.gen(function* () {
        const { fs, path, root, transact, stores } = yield* raceWorkspace;
        const target = path.join(root, "D");
        yield* directoryWithFiles(fs, target);
        const editing = afterCopyOf(
          fs,
          target,
          change === "edited"
            ? fs.writeFileString(path.join(target, "f1"), "foreign")
            : Effect.void,
        );
        // The created store's identity check observes it as unreadable.
        const created: Array<string> = [];
        let failure: WorkspaceSnapshotError | undefined;
        yield* transact(
          {
            ...editing,
            makeTempDirectory: (options) =>
              editing.makeTempDirectory(options).pipe(
                Effect.tap((store) =>
                  Effect.sync(() => {
                    if (options?.prefix === ".axm-retired-") created.push(store);
                  }),
                ),
              ),
            stat: (file) =>
              created.includes(file)
                ? Effect.fail(
                    PlatformError.badArgument({
                      module: "FileSystem",
                      method: "stat",
                      description: "injected unreadable store",
                    }),
                  )
                : editing.stat(file),
          },
          Effect.gen(function* () {
            failure = yield* retireWorkspacePath(target).pipe(Effect.flip);
          }),
        );
        expect(created).toHaveLength(1);
        if (change === "edited") {
          // A foreign change takes precedence, and the created store is removed.
          expect([failure?.target, failure?.step, failure?.cause]).toEqual([
            target,
            "inspect-target",
            "foreign-change",
          ]);
          expect(yield* stores).toEqual([]);
        } else
          expect([failure?.target, failure?.step, failure?.cause]).toEqual([
            created[0],
            "create-store",
            "retirement-store-unreadable",
          ]);
        expect(yield* fs.readFileString(path.join(target, "f1"))).toBe(
          change === "edited" ? "foreign" : "f1",
        );
        expect(yield* fs.readFileString(path.join(target, "f2"))).toBe("f2");
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect("reports a foreign edit before a failure to create the quarantine store", () =>
    Effect.gen(function* () {
      const { fs, path, root, transact, stores } = yield* raceWorkspace;
      const target = path.join(root, "D");
      yield* directoryWithFiles(fs, target);
      const editing = afterCopyOf(
        fs,
        target,
        fs.writeFileString(path.join(target, "f1"), "foreign"),
      );
      let failure: WorkspaceSnapshotError | undefined;
      yield* transact(
        {
          ...editing,
          makeTempDirectory: (options) =>
            options?.prefix === ".axm-retired-"
              ? Effect.fail(
                  PlatformError.badArgument({
                    module: "FileSystem",
                    method: "makeTempDirectory",
                    description: "injected store failure",
                  }),
                )
              : editing.makeTempDirectory(options),
        },
        Effect.gen(function* () {
          failure = yield* retireWorkspacePath(target).pipe(Effect.flip);
        }),
      );
      expect([failure?.step, failure?.cause]).toEqual(["inspect-target", "foreign-change"]);
      expect(yield* stores).toEqual([]);
      expect(yield* fs.readFileString(path.join(target, "f1"))).toBe("foreign");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  for (const change of ["a foreign sibling", "a swapped intermediate directory"] as const) {
    it.effect(`refuses a descendant retirement beside ${change}`, () =>
      Effect.gen(function* () {
        const { fs, path, root, transact } = yield* raceWorkspace;
        const owner = path.join(root, "D");
        const parent = path.join(owner, "sub");
        const entry = path.join(parent, "x");
        yield* fs.makeDirectory(parent, { recursive: true });
        yield* fs.writeFileString(entry, "x");
        let failure: WorkspaceSnapshotError | undefined;
        yield* transact(
          fs,
          Effect.gen(function* () {
            yield* protectWorkspacePath(owner);
            if (change === "a foreign sibling")
              yield* fs.writeFileString(path.join(owner, "z"), "foreign");
            else {
              yield* fs.rename(parent, path.join(root, "old-sub"));
              yield* fs.makeDirectory(parent);
              yield* fs.writeFileString(entry, "foreign");
            }
            failure = yield* retireWorkspacePath(entry).pipe(Effect.flip);
          }),
        );
        expect([failure?.step, failure?.cause]).toEqual(["inspect-target", "foreign-change"]);
        expect(yield* fs.readFileString(entry)).toBe(
          change === "a foreign sibling" ? "x" : "foreign",
        );
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }
});

describe("retirement failure after protection", () => {
  it.effect("keeps the protection when the move into the store fails", () =>
    Effect.gen(function* () {
      const { fs, path, root, transact, stores } = yield* raceWorkspace;
      const target = path.join(root, "D");
      yield* directoryWithFiles(fs, target);
      const faulty = yield* FileSystem.FileSystem.pipe(
        Effect.provide(
          injectWriteFaults(
            (operation) =>
              operation.kind === "rename" &&
              operation.source === target &&
              path.basename(path.dirname(operation.path)).startsWith(".axm-retired-"),
          ),
        ),
      );
      let failure: WorkspaceSnapshotError | undefined;
      let protectedState: string | undefined;
      const exit = yield* transact(
        faulty,
        Effect.gen(function* () {
          failure = yield* retireWorkspacePath(target).pipe(Effect.flip);
          const ledger = yield* currentLedger;
          protectedState = ledger.snapshots.find((snapshot) => snapshot.target === target)?.state;
          return yield* failure;
        }),
      );
      expect(failure?.step).toBe("copy");
      expect(protectedState).toBe("copied");
      // Rollback finds the protected target intact and reports the failure itself.
      expect(failureOf(exit)).toBe(failure);
      expect(yield* stores).toEqual([]);
      expect(yield* fs.readFileString(path.join(target, "f1"))).toBe("f1");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("keeps the protection and its store when retirement dies", () =>
    Effect.gen(function* () {
      const { fs, path, root, transact } = yield* raceWorkspace;
      const target = path.join(root, "D");
      yield* directoryWithFiles(fs, target);
      const defect = new Error("injected defect");
      let snapshotDir: string | undefined;
      let protectedState: string | undefined;
      const exit = yield* transact(
        {
          ...fs,
          makeTempDirectory: (options) =>
            options?.prefix === ".axm-retired-"
              ? Effect.die(defect)
              : fs.makeTempDirectory(options),
        },
        Effect.gen(function* () {
          const retired = yield* retireWorkspacePath(target).pipe(Effect.exit);
          const ledger = yield* currentLedger;
          snapshotDir = ledger.snapshotDir;
          protectedState = ledger.snapshots.find((snapshot) => snapshot.target === target)?.state;
          return yield* retired;
        }),
      );
      expect(protectedState).toBe("copied");
      if (snapshotDir === undefined) return expect.fail("Expected a snapshot store");
      // The defect propagates unchanged, and the failed transaction removes its store.
      expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined).toBe(defect);
      expect(yield* fs.exists(snapshotDir)).toBe(false);
      expect(yield* fs.readFileString(path.join(target, "f1"))).toBe("f1");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

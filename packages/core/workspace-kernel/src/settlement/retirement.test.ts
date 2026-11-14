/**
 * Retirement cleanup at settlement: a retired original is discarded only when
 * its quarantine store and the retained entry still match what retirement
 * recorded. Real temporary directories supply the identities compared.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { resolveNativeReferent } from "../locations/index.js";
import { CanonicalNativePathLive } from "../locations/live.js";
import { NativePlatformTest } from "../locations/testing.js";
import { WorkspaceRestorationError } from "./errors.js";
import { retireWorkspacePath, runWorkspaceTransaction } from "./index.js";
import { WorkspaceTransactionScopeTest } from "./testing.js";

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

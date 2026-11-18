import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Tracer from "effect/Tracer";
import { NativePlatformTest, withDetailedWork } from "../locations/testing.js";
import {
  observeAncestorRoute,
  observeNativeRoute,
  observePathEntry,
  observePathState,
  observePathStateExcept,
} from "./path-state.js";

const privileged = process.platform === "win32" || process.getuid?.() === 0;

/** A file, a nested directory tree, a symlink and an absent path under a fresh root. */
const entries = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const tree = path.join(root, "tree");
  yield* fs.makeDirectory(path.join(tree, "entry", "nested"), { recursive: true });
  yield* fs.writeFileString(path.join(tree, "entry", "nested", "deep.txt"), "deep");
  yield* fs.writeFileString(path.join(tree, "entry", "one.txt"), "one");
  yield* fs.writeFileString(path.join(tree, "entry-sibling"), "sibling");
  yield* fs.writeFileString(path.join(tree, "other.txt"), "other");
  const file = path.join(tree, "other.txt");
  const link = path.join(root, "link");
  yield* fs.symlink(tree, link);
  return { fs, path, root, tree, file, link, absent: path.join(root, "absent") };
});

it.effect("accounts for preimage hashing without changing independent file observations", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const target = path.join(root, "private.json");
    yield* fs.writeFileString(target, "abc");
    let reads = 0;
    const counted: FileSystem.FileSystem = {
      ...fs,
      readFile: (...args) => {
        reads += 1;
        return fs.readFile(...args);
      },
    };
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const state = yield* observePathState(counted, path, target).pipe(withDetailedWork(tracer));
    expect(state.get("")).toMatch(
      /:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad$/,
    );
    expect(reads).toBe(1);
    const hashes = spans.filter((span) => span.name === "axm.hash.preimage");
    expect(hashes).toHaveLength(1);
    expect(hashes[0]?.attributes.get("axm.work.bytes")).toBe(3);
    expect(hashes[0]?.attributes.get("axm.work.count")).toBe(1);
    expect(JSON.stringify(hashes.map((span) => [...span.attributes]))).not.toContain(target);
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

it.effect("observes only the root entry exactly as the full observation reports it", () =>
  Effect.gen(function* () {
    const { fs, path, tree, file, link, absent } = yield* entries;
    for (const target of [file, tree, path.join(tree, "entry"), link, absent]) {
      expect(yield* observePathEntry(fs, path, target)).toBe(
        (yield* observePathState(fs, path, target)).get(""),
      );
    }
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

it.effect.skipIf(privileged)("reports an unlistable directory as the full observation does", () =>
  Effect.gen(function* () {
    const { fs, path, tree } = yield* entries;
    const closed = path.join(tree, "entry");
    yield* fs.chmod(closed, 0o000);
    const entry = yield* observePathEntry(fs, path, closed);
    const full = yield* observePathState(fs, path, closed);
    yield* fs.chmod(closed, 0o755);
    expect(full).toEqual(new Map([["", "unreadable"]]));
    expect(entry).toBe("unreadable");
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

it.effect("omits one child subtree only from a directory whose root matches", () =>
  Effect.gen(function* () {
    const { fs, path, tree, file, link, absent } = yield* entries;
    const full = yield* observePathState(fs, path, tree);
    const root = full.get("");
    const without = (name: string) =>
      new Map([...full].filter(([key]) => key !== name && !key.startsWith(`${name}${path.sep}`)));
    expect([...(yield* observePathStateExcept(fs, path, tree, "entry", root))]).toEqual([
      ...without("entry"),
    ]);
    expect([...(yield* observePathStateExcept(fs, path, tree, "entry"))]).toEqual([
      ...without("entry"),
    ]);
    // A name that is not a child, and a non-matching root, change nothing.
    expect([...(yield* observePathStateExcept(fs, path, tree, "missing", root))]).toEqual([
      ...full,
    ]);
    expect([
      ...(yield* observePathStateExcept(fs, path, tree, "entry", "directory:other")),
    ]).toEqual([...full]);
    for (const target of [file, link, absent]) {
      expect([
        ...(yield* observePathStateExcept(
          fs,
          path,
          target,
          "entry",
          (yield* observePathState(fs, path, target)).get(""),
        )),
      ]).toEqual([...(yield* observePathState(fs, path, target))]);
    }
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

/** Today's route baseline: both full ancestor walks, merged with the root walk's values winning. */
const mergedWalks = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  nativeRoot: string,
) =>
  Effect.gen(function* () {
    return new Map([
      ...(yield* observeAncestorRoute(fs, path, target)),
      ...(yield* observeAncestorRoute(fs, path, nativeRoot)),
    ]);
  });

it.effect("builds the same route baseline while walking ancestors above the root once", () =>
  Effect.gen(function* () {
    const { fs, path, root, tree } = yield* entries;
    const cases: ReadonlyArray<readonly [string, string]> = [
      [path.join(tree, "entry", "nested", "deep.txt"), tree],
      [path.join(tree, "entry", "missing", "leaf.txt"), tree],
      [path.join(tree, "other.txt"), tree],
      [tree, tree],
      [path.join(tree, "other.txt"), path.parse(tree).root],
      [path.join(root, "outside.txt"), tree],
      [path.join(`${tree}-suffix`, "file.txt"), tree],
    ];
    for (const [target, nativeRoot] of cases) {
      expect([...(yield* observeNativeRoute(fs, path, target, nativeRoot))]).toEqual([
        ...(yield* mergedWalks(fs, path, target, nativeRoot)),
      ]);
    }
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

it.effect.skipIf(privileged)("fails a route baseline at the same unreadable ancestor", () =>
  Effect.gen(function* () {
    const { fs, path, tree } = yield* entries;
    const locked = path.join(tree, "entry");
    const nativeRoot = path.join(locked, "nested");
    yield* fs.chmod(locked, 0o000);
    const failures: Array<readonly [PlatformError, PlatformError]> = [];
    for (const target of [path.join(nativeRoot, "deep.txt"), path.join(nativeRoot, "a", "b")]) {
      const bounded = yield* observeNativeRoute(fs, path, target, nativeRoot).pipe(Effect.flip);
      const merged = yield* mergedWalks(fs, path, target, nativeRoot).pipe(Effect.flip);
      failures.push([bounded, merged]);
    }
    yield* fs.chmod(locked, 0o755);
    for (const [bounded, merged] of failures) {
      expect(bounded.reason._tag).toBe("PermissionDenied");
      expect(bounded).toEqual(merged);
    }
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

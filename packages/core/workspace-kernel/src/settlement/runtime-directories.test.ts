import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  assertNativeMutationWithin,
  captureContainerIdentity,
  NativeEntryRemoval,
  resolveNativeReferent,
  verifyContainerIdentity,
  type ContainerIdentity,
} from "../locations/index.js";
import { CanonicalNativePathLive } from "../locations/live.js";
import { NativePlatformTest, workObservations } from "../locations/testing.js";
import { WorkspaceDirectoryError } from "./errors.js";
import {
  createWorkspaceDirectories,
  removeEmptyRuntimeDirectories,
} from "./runtime-directories.js";

const platform = Layer.merge(NativePlatformTest, CanonicalNativePathLive);

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const removal = yield* NativeEntryRemoval;
  const root = yield* fs
    .makeTempDirectoryScoped({ prefix: "axm-native-removal-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  return { fs, path, removal, root };
});

/** The lock scratch call shape: a runtime directory beneath a workspace directory. */
const scratchArgs = (path: Path.Path, root: string) => ({
  nativeRoot: root,
  workspaceDir: path.join(root, "scratch"),
  identityOwnerRoot: root,
  target: path.join(root, "scratch", "tmp"),
  record: () => Effect.void,
});

describe("empty runtime directory removal", () => {
  it.effect("preserves a foreign child added after directory identity verification", () =>
    Effect.gen(function* () {
      const { fs, path, removal, root } = yield* fixture;
      const directory = path.join(root, "owned");
      yield* fs.makeDirectory(directory);
      const identity = yield* captureContainerIdentity({ nativeRoot: root, target: directory });
      const attempted = yield* Ref.make(false);
      const raced = NativeEntryRemoval.of({
        ...removal,
        removeEmptyDirectory: (target) =>
          Effect.gen(function* () {
            expect(target).toBe(directory);
            yield* Ref.set(attempted, true);
            yield* fs.writeFileString(path.join(target, "foreign"), "arrived after proof");
            yield* removal.removeEmptyDirectory(target);
          }),
      });
      yield* removeEmptyRuntimeDirectories([identity]).pipe(
        Effect.provideService(NativeEntryRemoval, raced),
      );
      expect(yield* Ref.get(attempted)).toBe(true);
      expect(yield* fs.readFileString(path.join(directory, "foreign"))).toBe("arrived after proof");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

describe("runtime directory proof", () => {
  it.effect("proves an existing runtime directory with one rooted capture", () =>
    Effect.gen(function* () {
      const { fs, path, root } = yield* fixture;
      const args = scratchArgs(path, root);
      yield* fs.makeDirectory(args.target, { recursive: true });
      const { fileSystem, recording } = makeRecordingFileSystem(fs);
      const observations = workObservations(false);
      recording.reset();
      const created = yield* createWorkspaceDirectories(args).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        observations.provide,
      );
      expect(created).toEqual([]);
      expect({
        target: recording.counts(args.target),
        canonicalPaths: observations.facts.filter(
          (fact) => fact.kind === "axm.native.canonical-path",
        ).length,
      }).toEqual({
        target: { access: 1, realPath: 1, stat: 2, readLink: 1 },
        canonicalPaths: 2,
      });
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("keeps the creation sequence when the runtime directory is missing", () =>
    Effect.gen(function* () {
      const { fs, path, root } = yield* fixture;
      const args = scratchArgs(path, root);
      yield* fs.makeDirectory(args.workspaceDir);
      const { fileSystem, recording } = makeRecordingFileSystem(fs);
      const recorded: Array<ContainerIdentity> = [];
      recording.reset();
      const created = yield* createWorkspaceDirectories({
        ...args,
        record: (identity) => Effect.sync(() => recorded.push(identity)),
      }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
      expect(created.map((identity) => identity.physicalPath)).toEqual([args.target]);
      expect(recorded).toEqual(created);
      expect(
        recording.calls({ path: args.target }).map(({ method, outcome }) => `${method}:${outcome}`),
      ).toEqual(CREATION_SEQUENCE);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("refuses an existing regular file at the runtime directory before any write", () =>
    Effect.gen(function* () {
      const { fs, path, root } = yield* fixture;
      const args = scratchArgs(path, root);
      yield* fs.makeDirectory(args.workspaceDir);
      yield* fs.writeFileString(args.target, "foreign");
      const { fileSystem, recording } = makeRecordingFileSystem(fs);
      recording.reset();
      const exit = yield* createWorkspaceDirectories(args).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.exit,
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(encodeExit(exit)).toEqual({
        failure: [
          {
            fail: {
              _tag: "WorkspaceDirectoryError",
              path: args.target,
              step: "create",
              cause: {
                _tag: "NativeLocationError",
                target: args.target,
                reason: "unreadable",
                cause: "workspace-owner-not-directory",
              },
            },
          },
        ],
      });
      expect(
        recording
          .calls()
          .filter(({ method }) =>
            ["makeDirectory", "writeFile", "remove", "rename", "chmod", "symlink"].includes(method),
          ),
      ).toEqual([]);
      expect(yield* fs.readFileString(args.target)).toBe("foreign");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});

/** Observed on the lock scratch directory while it is created beneath an existing parent. */
const CREATION_SEQUENCE: ReadonlyArray<string> = [
  "access:failure",
  "readLink:failure",
  "readLink:failure",
  "stat:failure",
  "makeDirectory:success",
  "readLink:failure",
  "stat:success",
  "realPath:success",
  "stat:success",
  "readLink:failure",
  "stat:success",
  "realPath:success",
  "stat:success",
];

/** Errors carry no schema; their tags, fields and nested causes are the compared surface. */
const encode = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(encode);
  const fields = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "stack")
      .map(([key, field]) => [key, encode(field)]),
  );
  // Error causes are not enumerable.
  if ("cause" in value) fields["cause"] = encode(value.cause);
  if ("_tag" in value) return { ...fields, _tag: value._tag };
  return value instanceof Error ? { name: value.name, message: value.message, ...fields } : fields;
};

const encodeExit = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isSuccess(exit)
    ? { success: encode(exit.value) }
    : {
        failure: exit.cause.reasons.map((reason) =>
          reason._tag === "Fail"
            ? { fail: encode(reason.error) }
            : reason._tag === "Die"
              ? { die: encode(reason.defect) }
              : { interrupt: true },
        ),
      };

/** The proof sequence the runtime directory protocol has always performed, in its order. */
const proofOracle = (args: ReturnType<typeof scratchArgs>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const missing: string[] = [];
    let ancestor = args.target;
    while (!(yield* fs.exists(ancestor))) {
      missing.push(ancestor);
      ancestor = path.dirname(ancestor);
    }
    const ownerRoot = path.dirname(args.workspaceDir);
    const proof = { nativeRoot: ancestor, ownerRoot: ancestor, target: ancestor };
    const anchor = yield* captureContainerIdentity(proof);
    for (const directory of missing.reverse()) {
      yield* assertNativeMutationWithin(args.nativeRoot, directory, "entry", ownerRoot);
      if (!(yield* verifyContainerIdentity(anchor, proof)))
        return yield* new WorkspaceDirectoryError({
          path: directory,
          step: "create",
          cause: "runtime-parent-changed",
        });
      const created = yield* fs.makeDirectory(directory).pipe(
        Effect.as(true),
        Effect.catch((cause) =>
          cause.reason._tag === "AlreadyExists" ? Effect.succeed(false) : Effect.fail(cause),
        ),
      );
      if (created)
        yield* captureContainerIdentity({
          nativeRoot: args.nativeRoot,
          ownerRoot,
          identityOwnerRoot: args.identityOwnerRoot,
          target: directory,
        });
    }
    if (!(yield* verifyContainerIdentity(anchor, proof)))
      return yield* new WorkspaceDirectoryError({
        path: args.target,
        step: "create",
        cause: "runtime-parent-changed",
      });
    yield* captureContainerIdentity({
      nativeRoot: args.nativeRoot,
      ownerRoot,
      identityOwnerRoot: args.identityOwnerRoot,
      target: args.target,
    });
    return [];
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof WorkspaceDirectoryError
        ? cause
        : new WorkspaceDirectoryError({ path: args.target, step: "create", cause }),
    ),
  );

interface TargetState {
  readonly name: string;
  readonly skip?: boolean;
  /** Arrange `<case>/scratch/tmp`; `outside` is a sibling of the native root. */
  readonly arrange: (paths: {
    readonly root: string;
    readonly target: string;
    readonly outside: string;
  }) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>;
  /** Wrap the filesystem the protocol observes. */
  readonly observe?: (
    fs: FileSystem.FileSystem,
    target: string,
    path: Path.Path,
  ) => FileSystem.FileSystem;
}

const unprivilegedPosix =
  process.platform !== "win32" && process.getuid !== undefined && process.getuid() !== 0;

const targetStates: ReadonlyArray<TargetState> = [
  {
    name: "directory",
    arrange: ({ target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(target, { recursive: true });
      }),
  },
  {
    name: "directory beneath a symlinked ancestor inside the root",
    arrange: ({ root, target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.join(root, "elsewhere", "tmp"), { recursive: true });
        yield* fs.symlink(path.join(root, "elsewhere"), path.dirname(target));
      }),
  },
  {
    name: "regular file",
    arrange: ({ target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, "file");
      }),
  },
  {
    name: "hardlinked file",
    arrange: ({ root, target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(path.join(root, "original"), "file");
        yield* fs.link(path.join(root, "original"), target);
      }),
  },
  {
    name: "symlink to a directory inside the root",
    arrange: ({ root, target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.makeDirectory(path.join(root, "inside"));
        yield* fs.symlink(path.join(root, "inside"), target);
      }),
  },
  {
    name: "symlink to a directory outside the root",
    arrange: ({ target, outside }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.makeDirectory(outside);
        yield* fs.symlink(outside, target);
      }),
  },
  {
    name: "symlink to a file",
    arrange: ({ root, target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(path.join(root, "file"), "file");
        yield* fs.symlink(path.join(root, "file"), target);
      }),
  },
  {
    // `exists` follows the link, so this state takes the creation path.
    name: "dangling symlink (creation path control)",
    arrange: ({ root, target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.symlink(path.join(root, "absent"), target);
      }),
  },
  {
    name: "directory removed after the existence check",
    arrange: ({ target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(target, { recursive: true });
      }),
    observe: (fs, target) => ({
      ...fs,
      exists: (candidate) =>
        fs
          .exists(candidate)
          .pipe(
            Effect.tap((present) =>
              present && candidate === target
                ? fs.remove(target, { recursive: true })
                : Effect.void,
            ),
          ),
    }),
  },
  {
    // The existence walk itself fails, before any capture.
    name: "unsearchable parent before the existence check (existence walk control)",
    skip: !unprivilegedPosix,
    arrange: ({ target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(target, { recursive: true });
        yield* fs.chmod(path.dirname(target), 0o000);
      }),
  },
  {
    // Every capture after the existence walk is refused with a permission error.
    name: "parent made unsearchable after the existence check",
    skip: !unprivilegedPosix,
    arrange: ({ target }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(target, { recursive: true });
      }),
    observe: (fs, target, path) => ({
      ...fs,
      exists: (candidate) =>
        fs
          .exists(candidate)
          .pipe(
            Effect.tap((present) =>
              present && candidate === target ? fs.chmod(path.dirname(target), 0o000) : Effect.void,
            ),
          ),
    }),
  },
];

describe("runtime directory proof equivalence", () => {
  for (const state of targetStates)
    it.effect.skipIf(state.skip === true)(`matches the full proof sequence: ${state.name}`, () =>
      Effect.gen(function* () {
        const { fs, path, root: base } = yield* fixture;
        const root = path.join(base, "case");
        const outside = path.join(base, "outside");
        const args = scratchArgs(path, root);
        const observed = (
          run: Effect.Effect<unknown, unknown, FileSystem.FileSystem | Path.Path>,
        ) =>
          Effect.gen(function* () {
            yield* fs.makeDirectory(root);
            yield* state.arrange({ root, target: args.target, outside });
            const exit = yield* run.pipe(
              Effect.provideService(
                FileSystem.FileSystem,
                state.observe === undefined ? fs : state.observe(fs, args.target, path),
              ),
              Effect.exit,
            );
            return encodeExit(exit);
          }).pipe(
            Effect.ensuring(
              Effect.gen(function* () {
                yield* fs.chmod(args.workspaceDir, 0o755).pipe(Effect.ignore);
                yield* fs.remove(root, { recursive: true }).pipe(Effect.ignore);
                yield* fs.remove(outside, { recursive: true }).pipe(Effect.ignore);
              }),
            ),
          );
        const expected = yield* observed(proofOracle(args));
        const actual = yield* observed(createWorkspaceDirectories(args));
        expect(actual).toEqual(expected);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
});

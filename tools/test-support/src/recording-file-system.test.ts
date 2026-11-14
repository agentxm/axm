import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";

import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  makeRecordingFileSystem,
  type FileSystemRecording,
  type RecordedFileSystemCall,
  type RecordedFileSystemMethod,
} from "./index.js";

// Every case runs against the host filesystem in a scoped temporary directory,
// because the claims concern what the wrapped primitives physically perform.
const nodeFileSystem = FileSystem.FileSystem.pipe(Effect.provide(NodeFileSystem.layer));

const recordingWorld = Effect.gen(function* () {
  const base = yield* nodeFileSystem;
  const root = yield* base.makeTempDirectoryScoped({ prefix: "axm-recording-fs-" });
  return { base, root, ...makeRecordingFileSystem(base) };
});

const bytes = (text: string) => new TextEncoder().encode(text);

describe("recording filesystem", () => {
  it.effect("records each derived operation once through the primitive it performs", () =>
    Effect.gen(function* () {
      const { root, fileSystem: fs, recording } = yield* recordingWorld;
      const file = `${root}/settings.json`;
      const streamed = `${root}/streamed`;
      const absent = `${root}/absent`;

      yield* fs.writeFileString(file, "hello");
      expect(yield* fs.readFileString(file)).toBe("hello");
      expect(yield* fs.exists(file)).toBe(true);
      expect(yield* fs.exists(absent)).toBe(false);
      yield* Stream.make(bytes("ab"), bytes("cde")).pipe(Stream.run(fs.sink(streamed)));
      const chunks = yield* fs.stream(streamed).pipe(Stream.runCollect);
      expect(chunks.map((chunk) => new TextDecoder().decode(chunk))).toEqual(["abcde"]);

      const expected: ReadonlyArray<RecordedFileSystemCall> = [
        { method: "writeFile", path: file, bytes: 5, outcome: "success" },
        { method: "readFile", path: file, bytes: 5, outcome: "success" },
        { method: "access", path: file, outcome: "success" },
        { method: "access", path: absent, outcome: "failure" },
        { method: "open", path: streamed, outcome: "success" },
        { method: "file.writeAll", path: streamed, bytes: 2, outcome: "success" },
        { method: "file.writeAll", path: streamed, bytes: 3, outcome: "success" },
        { method: "open", path: streamed, outcome: "success" },
        { method: "file.readAlloc", path: streamed, bytes: 5, outcome: "success" },
        { method: "file.readAlloc", path: streamed, bytes: 0, outcome: "success" },
      ];
      expect(recording.calls()).toEqual(expected);
      expect(recording.contentReads(file)).toBe(1);
      expect(recording.writes(file)).toBe(1);
      expect(recording.contentReads(streamed)).toBe(2);
      expect(recording.writes(streamed)).toBe(2);
      expect(recording.counts(file)).toEqual({ writeFile: 1, readFile: 1, access: 1 });

      recording.reset();
      yield* fs.makeDirectory(`${root}/tree/nested`, { recursive: true });
      yield* fs.writeFileString(`${root}/tree/nested/a.md`, "a");
      recording.reset();
      expect(yield* fs.glob("**/*.md", { root: `${root}/tree` })).toEqual(["nested/a.md"]);
      const globbed = recording.calls();
      // Glob's walk order belongs to Effect; the claim is that it only reaches
      // the filesystem through recorded primitives, listing each directory once.
      const walkPrimitives: ReadonlyArray<RecordedFileSystemMethod> = [
        "readDirectoryEntries",
        "stat",
        "readLink",
      ];
      expect(globbed.every((call) => walkPrimitives.includes(call.method))).toBe(true);
      expect(recording.calls({ method: "readDirectoryEntries" }).map((call) => call.path)).toEqual([
        `${root}/tree`,
        `${root}/tree/nested`,
      ]);
    }),
  );

  it.effect("records failures and interruptions while propagating them unchanged", () =>
    Effect.gen(function* () {
      const { base, root } = yield* recordingWorld;
      const sentinel = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "readFile",
        pathOrDescriptor: `${root}/denied`,
      });
      // The stubbed primitives only make error identity and a stalled call
      // observable; host error semantics are covered by the missing-file read.
      const { fileSystem: fs, recording } = makeRecordingFileSystem(
        FileSystem.make({
          ...base,
          readFile: (path) =>
            path === `${root}/denied` ? Effect.fail(sentinel) : base.readFile(path),
          stat: (path) => (path === `${root}/stalled` ? Effect.never : base.stat(path)),
        }),
      );

      expect(yield* Effect.flip(fs.readFileString(`${root}/denied`))).toBe(sentinel);
      const missing = yield* Effect.flip(fs.readFile(`${root}/missing`));
      expect(missing.reason._tag).toBe("NotFound");
      const stalled = yield* Effect.forkChild(fs.stat(`${root}/stalled`));
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(stalled);

      expect(recording.calls()).toEqual([
        { method: "readFile", path: `${root}/denied`, outcome: "failure" },
        { method: "readFile", path: `${root}/missing`, outcome: "failure" },
        { method: "stat", path: `${root}/stalled`, outcome: "interrupted" },
      ]);
      expect(recording.contentReads(`${root}/missing`)).toBe(1);
    }),
  );

  it.effect("attributes handle operations to the opened path with byte counts", () =>
    Effect.gen(function* () {
      const { root, fileSystem: fs, recording } = yield* recordingWorld;
      const path = `${root}/handle`;
      const buffer = new Uint8Array(8);

      const read = yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(path, { flag: "w+" });
          expect(yield* file.write(bytes("abc"))).toBe(3);
          yield* file.writeAll(bytes("defg"));
          yield* file.sync;
          yield* file.truncate(6);
          expect(yield* file.seek(0n, "start")).toBe(0n);
          const count = yield* file.read(buffer);
          const rest = yield* file.readAlloc(4, { position: 2n });
          expect((yield* file.stat).size).toBe(6n);
          return { count, rest };
        }),
      );
      expect(read.count).toBe(6);
      expect(new TextDecoder().decode(buffer.subarray(0, read.count))).toBe("abcdef");
      expect(Option.map(read.rest, (value) => new TextDecoder().decode(value))).toEqual(
        Option.some("cdef"),
      );

      expect(recording.calls()).toEqual([
        { method: "open", path, outcome: "success" },
        { method: "file.write", path, bytes: 3, outcome: "success" },
        { method: "file.writeAll", path, bytes: 4, outcome: "success" },
        { method: "file.sync", path, outcome: "success" },
        { method: "file.truncate", path, outcome: "success" },
        { method: "file.seek", path, outcome: "success" },
        { method: "file.read", path, bytes: 6, outcome: "success" },
        { method: "file.readAlloc", path, bytes: 4, outcome: "success" },
        { method: "file.stat", path, outcome: "success" },
      ]);
      expect(recording.contentReads(path)).toBe(2);
      expect(recording.writes(path)).toBe(2);
    }),
  );

  it.effect("records both operands of two-path operations and filters on either", () =>
    Effect.gen(function* () {
      const { root, fileSystem: fs, recording } = yield* recordingWorld;
      const source = `${root}/source`;
      const staged = `${root}/staged`;
      const target = `${root}/target`;
      yield* fs.writeFileString(source, "content");
      recording.reset();

      yield* fs.copyFile(source, staged);
      yield* fs.rename(staged, target);
      yield* fs.copy(target, `${root}/copy`);
      yield* fs.link(target, `${root}/hard`);
      yield* fs.symlink("target", `${root}/soft`);

      expect(recording.calls()).toEqual([
        { method: "copyFile", path: source, toPath: staged, outcome: "success" },
        { method: "rename", path: staged, toPath: target, outcome: "success" },
        { method: "copy", path: target, toPath: `${root}/copy`, outcome: "success" },
        { method: "link", path: target, toPath: `${root}/hard`, outcome: "success" },
        { method: "symlink", path: "target", toPath: `${root}/soft`, outcome: "success" },
      ]);
      expect(recording.counts(target)).toEqual({ rename: 1, copy: 1, link: 1 });
      expect(recording.calls({ path: staged, method: "rename" })).toEqual([
        { method: "rename", path: staged, toPath: target, outcome: "success" },
      ]);
      expect(recording.calls({ method: "remove" })).toEqual([]);
    }),
  );

  it.effect("records every concurrent call and clears on reset", () =>
    Effect.gen(function* () {
      const { root, fileSystem: fs, recording } = yield* recordingWorld;
      const paths = Array.from({ length: 24 }, (_, index) => `${root}/file-${index}`);

      yield* Effect.forEach(paths, (path) => fs.writeFileString(path, path), {
        concurrency: "unbounded",
      });
      expect(recording.calls()).toHaveLength(paths.length);
      recording.reset();
      expect(recording.calls()).toEqual([]);

      const contents = yield* Effect.forEach(
        paths,
        (path) => Effect.zip(fs.readFileString(path), fs.stat(path), { concurrent: true }),
        { concurrency: "unbounded" },
      );
      expect(contents.map(([content]) => content)).toEqual(paths);
      expect(recording.calls()).toHaveLength(paths.length * 2);
      for (const path of paths) {
        expect(recording.counts(path)).toEqual({ readFile: 1, stat: 1 });
      }
    }),
  );

  it.effect("behaves like the base filesystem it records", () =>
    Effect.gen(function* () {
      const base = yield* nodeFileSystem;
      const sequence = (fs: FileSystem.FileSystem) =>
        Effect.gen(function* () {
          const root = yield* base.makeTempDirectoryScoped({ prefix: "axm-recording-parity-" });
          yield* fs.writeFileString(`${root}/draft`, "draft");
          const info = yield* fs.stat(`${root}/draft`);
          yield* fs.rename(`${root}/draft`, `${root}/final`);
          const listed = yield* fs.readDirectory(root);
          const read = yield* fs.readFileString(`${root}/final`);
          yield* fs.remove(`${root}/final`);
          const removed = yield* Effect.flip(fs.readFileString(`${root}/final`));
          const renameMissing = yield* Effect.flip(fs.rename(`${root}/draft`, `${root}/again`));
          return {
            type: info.type,
            size: info.size,
            listed,
            read,
            after: yield* fs.exists(`${root}/final`),
            removed: removed.reason._tag,
            renameMissing: renameMissing.reason._tag,
          };
        });

      const recorded = yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const recording: FileSystemRecording = yield* FileSystemRecorder;
        const outcome = yield* sequence(fs);
        return { outcome, methods: recording.calls().map((call) => call.method) };
      }).pipe(Effect.provide(layerRecordingFileSystem(NodeFileSystem.layer)));

      expect(recorded.outcome).toEqual(yield* sequence(base));
      expect(recorded.methods).toEqual([
        "writeFile",
        "stat",
        "rename",
        "readDirectory",
        "readFile",
        "remove",
        "readFile",
        "rename",
        "access",
      ]);
    }),
  );
});

/**
 * Unit tests for the shared atomic-write helper.
 *
 * Covers string and binary payloads, the content-equality short-circuit in
 * both read-error modes, target pre-removal, per-step error mapping, temp
 * cleanup on failure, and concurrent writers to one target.
 */

import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, afterEach, beforeEach } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import { writeFileAtomic, type AtomicWriteFailure } from "./atomic-write.js";

const withContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

const identityFailure = (failure: AtomicWriteFailure): AtomicWriteFailure => failure;

const ancient = new Date("2000-01-01T00:00:00.000Z");
const cutoff = new Date("2001-01-01T00:00:00.000Z").getTime();

describe("writeFileAtomic", () => {
  let tempDir: string;
  let target: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "atomic-write-test-"));
    target = nodePath.join(tempDir, "target.txt");
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("writes string content and leaves no temp files", () =>
    withContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* writeFileAtomic(fs, {
          targetPath: target,
          content: "hello\n",
          mapError: identityFailure,
        });
        expect(nodeFs.readFileSync(target, "utf8")).toBe("hello\n");
        expect(nodeFs.readdirSync(tempDir)).toEqual(["target.txt"]);
      }),
    ),
  );

  it.effect("writes binary content", () =>
    withContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const payload = new Uint8Array([0, 1, 2, 253, 254, 255]);
        yield* writeFileAtomic(fs, {
          targetPath: target,
          content: payload,
          mapError: identityFailure,
        });
        expect(new Uint8Array(nodeFs.readFileSync(target))).toEqual(payload);
      }),
    ),
  );

  it.effect("replaces an existing target when removeTargetBeforeRename is set", () =>
    withContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        nodeFs.writeFileSync(target, "old");
        yield* writeFileAtomic(fs, {
          targetPath: target,
          content: "new",
          removeTargetBeforeRename: true,
          mapError: identityFailure,
        });
        expect(nodeFs.readFileSync(target, "utf8")).toBe("new");
        expect(nodeFs.readdirSync(tempDir)).toEqual(["target.txt"]);
      }),
    ),
  );

  describe("skipIfUnchanged", () => {
    it.effect("leaves an unchanged target untouched in fail-on-read-error mode", () =>
      withContext(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          nodeFs.writeFileSync(target, "same\n");
          yield* fs.utimes(target, ancient, ancient);
          yield* writeFileAtomic(fs, {
            targetPath: target,
            content: "same\n",
            skipIfUnchanged: "fail-on-read-error",
            mapError: identityFailure,
          });
          const info = yield* fs.stat(target);
          const mtime = Option.getOrThrow(info.mtime);
          expect(mtime.getTime()).toBeLessThan(cutoff);
        }),
      ),
    );

    it.effect("leaves an unchanged target untouched in ignore-read-errors mode", () =>
      withContext(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          nodeFs.writeFileSync(target, "same\n");
          yield* fs.utimes(target, ancient, ancient);
          yield* writeFileAtomic(fs, {
            targetPath: target,
            content: "same\n",
            skipIfUnchanged: "ignore-read-errors",
            mapError: identityFailure,
          });
          const info = yield* fs.stat(target);
          const mtime = Option.getOrThrow(info.mtime);
          expect(mtime.getTime()).toBeLessThan(cutoff);
        }),
      ),
    );

    it.effect("writes when the target content differs", () =>
      withContext(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          nodeFs.writeFileSync(target, "old\n");
          yield* writeFileAtomic(fs, {
            targetPath: target,
            content: "new\n",
            skipIfUnchanged: "fail-on-read-error",
            mapError: identityFailure,
          });
          expect(nodeFs.readFileSync(target, "utf8")).toBe("new\n");
        }),
      ),
    );

    it.effect("writes when the target is missing", () =>
      withContext(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* writeFileAtomic(fs, {
            targetPath: target,
            content: "fresh\n",
            skipIfUnchanged: "ignore-read-errors",
            mapError: identityFailure,
          });
          expect(nodeFs.readFileSync(target, "utf8")).toBe("fresh\n");
        }),
      ),
    );
  });

  it.effect("maps rename failures and removes the temp file", () =>
    withContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const targetDir = nodePath.join(tempDir, "target-dir");
        nodeFs.mkdirSync(targetDir);
        const failure = yield* writeFileAtomic(fs, {
          targetPath: targetDir,
          content: "cannot rename over a directory",
          mapError: identityFailure,
        }).pipe(Effect.flip);
        expect(failure.step).toBe("rename");
        expect(failure.targetPath).toBe(targetDir);
        expect(failure.tempPath.startsWith(`${targetDir}.tmp.`)).toBe(true);
        expect(nodeFs.readdirSync(tempDir)).toEqual(["target-dir"]);
      }),
    ),
  );

  it.effect("concurrent writers commit exactly one complete payload and no temp files", () =>
    withContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        // Large distinct payloads make torn or interleaved writes detectable.
        const payloads = Array.from(
          { length: 12 },
          (_, index) => `writer-${index}:${"x".repeat(256 * 1024)}:end-${index}\n`,
        );
        yield* Effect.all(
          payloads.map((content) =>
            writeFileAtomic(fs, { targetPath: target, content, mapError: identityFailure }),
          ),
          { concurrency: "unbounded", discard: true },
        );
        const final = nodeFs.readFileSync(target, "utf8");
        expect(payloads).toContain(final);
        expect(nodeFs.readdirSync(tempDir)).toEqual(["target.txt"]);
      }),
    ),
  );
});

/** Exercise publication witnesses and handle cleanup on the Windows filesystem. */
import * as nodeFs from "node:fs";
import { writeFileAtomic } from "@agentxm/host-primitives";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { NativePlatformTest } from "../locations/testing.js";

const identity = (info: FileSystem.File.Info) => ({
  type: info.type,
  device: String(info.dev),
  inode: Option.getOrUndefined(Option.map(info.ino, String)),
  birthtime: Option.getOrUndefined(Option.map(info.birthtime, (value) => value.getTime())),
  mode: info.mode,
});

const nativeIdentity = (info: nodeFs.BigIntStats) => ({
  type: info.isFile() ? "File" : "Directory",
  device: String(info.dev),
  inode: String(info.ino),
  birthtime: info.birthtime.getTime(),
  mode: Number(info.mode),
});

it.live.skipIf(process.platform !== "win32")(
  "binds a recreated publication to its staged handle and closes it when recording fails",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const target = path.join(root, "target.md");
      const content = "recreated owner bytes\n";
      yield* fs.writeFileString(target, "previous owner bytes\n");
      const previous = yield* Effect.sync(() =>
        nativeIdentity(nodeFs.statSync(target, { bigint: true })),
      );
      // Separate fixture creation timestamps; this is a filesystem-clock
      // condition for observing tunneling, not a retry of the publication.
      yield* Effect.sleep("50 millis");
      yield* fs.remove(target);

      const handles: FileSystem.File[] = [];
      const observations: Array<ReturnType<typeof identity>> = [];
      const forwarding: FileSystem.FileSystem = {
        ...fs,
        open: (file, options) =>
          fs.open(file, options).pipe(
            Effect.map((opened) => {
              handles.push(opened);
              return {
                ...opened,
                stat: opened.stat.pipe(
                  Effect.tap((info) =>
                    Effect.sync(() => {
                      observations.push(identity(info));
                    }),
                  ),
                ),
              };
            }),
          ),
      };
      const result = yield* writeFileAtomic(forwarding, {
        targetPath: target,
        content,
        mapError: (failure) => failure,
        onPublished: (publication) =>
          Effect.gen(function* () {
            const actual = yield* Effect.sync(() =>
              nativeIdentity(nodeFs.statSync(target, { bigint: true })),
            );
            const witness = identity(publication.info);
            const staged = observations[0];
            const finalHandle = observations[1];
            yield* Effect.logInfo(
              "Windows publication identity",
              JSON.stringify({
                previous,
                staged,
                finalHandle,
                actual,
                witness,
                birthtimeTunneled:
                  staged?.birthtime !== finalHandle?.birthtime &&
                  finalHandle?.birthtime === previous.birthtime,
              }),
            );
            expect(observations).toHaveLength(2);
            expect(staged?.birthtime).not.toBe(previous.birthtime);
            expect(finalHandle?.inode).toBe(staged?.inode);
            expect(witness).toEqual(actual);
            expect(publication.content).toBe(content);
            expect(nodeFs.readFileSync(target, "utf8")).toBe(content);
            return yield* Effect.fail("publication-callback-failed");
          }),
      }).pipe(Effect.result);

      expect(result).toEqual({ _tag: "Failure", failure: "publication-callback-failed" });
      expect(handles).toHaveLength(1);
      const handle = handles[0];
      if (handle === undefined) return expect.fail("Expected a retained staged file handle");
      const closed = yield* handle.stat.pipe(Effect.result);
      expect(closed._tag).toBe("Failure");
      expect(nodeFs.readdirSync(root)).toEqual(["target.md"]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

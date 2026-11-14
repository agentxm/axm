import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as PlatformError from "effect/PlatformError";
import { collectOwnedSourceFrames } from "./source-frames.js";

const owned = fileURLToPath(new URL("../app-error/app-error.ts", import.meta.url));

// Source runs bind the axm.sh package root to this checkout's apps/cli directory.
const cliRoot = fileURLToPath(new URL("../..", import.meta.url));
const builtAppError = join(cliRoot, "dist/src/app-error/app-error.js");
const builtSourceFrames = join(cliRoot, "dist/src/cli-runtime/source-frames.js");

const base64Digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const vlq = (value: number) => {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1;
  let digits = "";
  do {
    const digit = rest & 31;
    rest >>>= 5;
    digits += base64Digits[rest > 0 ? digit | 32 : digit];
  } while (rest > 0);
  return digits;
};

/**
 * A built module whose generated line `n` maps to `originalLines[n - 1]` of its
 * TypeScript source, with an optional comment padding the file before the map.
 */
const builtModule = (
  built: string,
  originalLines: ReadonlyArray<number>,
  options?: { readonly padding?: number; readonly withoutMap?: boolean },
) => {
  const original = join(cliRoot, relative(join(cliRoot, "dist"), built)).replace(/\.js$/u, ".ts");
  const source = relative(dirname(built), original);
  let previous = 0;
  const mappings = originalLines
    .map((line) => {
      const segment = `${vlq(0)}${vlq(0)}${vlq(line - 1 - previous)}${vlq(0)}`;
      previous = line - 1;
      return segment;
    })
    .join(";");
  const map = Buffer.from(
    JSON.stringify({ version: 3, sources: [source], names: [], mappings }),
  ).toString("base64");
  const code = originalLines.map((_, index) => `statement${index};`).join("\n");
  const padding = options?.padding === undefined ? "" : `\n//${"x".repeat(options.padding)}`;
  return options?.withoutMap === true
    ? `${code}${padding}\n`
    : `${code}${padding}\n//# sourceMappingURL=data:application/json;base64,${map}\n`;
};

const stackAt = (frames: ReadonlyArray<readonly [string, number]>) => ({
  stack: `Error: failed\n${frames.map(([file, line], index) => `    at call${index} (${file}:${line}:5)`).join("\n")}`,
});

/**
 * The native filesystem, with `open` of each synthetic built path redirected to
 * a temporary file holding `contents[path]`, recorded under the synthetic path.
 */
const builtFiles = (
  contents: Readonly<Record<string, string>>,
  openFault?: (path: string) => Effect.Effect<void, PlatformError.PlatformError>,
) =>
  Effect.gen(function* () {
    const native = yield* FileSystem.FileSystem;
    const directory = yield* native.makeTempDirectoryScoped();
    const redirected = new Map<string, string>();
    for (const [index, [synthetic, content]] of Object.entries(contents).entries()) {
      const target = join(directory, `built-${index}.js`);
      yield* native.writeFileString(target, content);
      redirected.set(synthetic, target);
    }
    const { fileSystem, recording } = makeRecordingFileSystem(
      FileSystem.make({
        ...native,
        open: (path, options) =>
          Effect.flatMap(openFault?.(path) ?? Effect.void, () =>
            native.open(redirected.get(path) ?? path, options),
          ),
      }),
    );
    recording.reset();
    return {
      recording,
      collect: (causes: ReadonlyArray<{ readonly stack?: string }>) =>
        collectOwnedSourceFrames(causes).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        ),
    };
  });

// Each frame is at stack column 5 and its mapping segment at generated column 0,
// so the mapped origin is column 4 of the original line (one-based 5).
const appErrorFrame = (line: number) => ({
  module: "axm.sh",
  filename: "src/app-error/app-error.ts",
  line,
  column: 4,
});

describe("owned source frames", () => {
  it.effect("admits catalogued locations and emits oldest first without function text", () =>
    Effect.gen(function* () {
      const frames = yield* collectOwnedSourceFrames([
        {
          stack: `Error: private message\n    at privateFunction (${owned}:2:4)\n    at ${owned}:3:5\n    at duplicate (${owned}:2:4)`,
        },
      ]);
      expect(frames).toEqual([
        { module: "axm.sh", filename: "src/app-error/app-error.ts", line: 3, column: 4 },
        { module: "axm.sh", filename: "src/app-error/app-error.ts", line: 2, column: 3 },
      ]);
      expect(JSON.stringify(frames)).not.toContain("private");
      expect(JSON.stringify(frames)).not.toContain(owned);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "omits invented owned names, traversal, excluded files and out-of-range locations",
    () =>
      Effect.gen(function* () {
        const unknown = fileURLToPath(new URL("invented-owned-file.ts", import.meta.url));
        const test = fileURLToPath(import.meta.url);
        const outside = fileURLToPath(
          new URL("../../../../../../private-source.ts", import.meta.url),
        );
        const frames = yield* collectOwnedSourceFrames([
          {
            stack: `Error\n at ${unknown}:1:1\n at ${test}:1:1\n at ${outside}:1:1\n at ${owned}:999999:1\n at ${owned}:1:0\n at node:internal/main:1:1`,
          },
        ]);
        expect(frames).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("diagnostic inspection defects do not escape", () =>
    Effect.gen(function* () {
      const frames = yield* collectOwnedSourceFrames([
        {
          get stack(): string {
            throw new Error("uninspectable foreign error");
          },
        },
      ]);
      expect(frames).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reads each built file's source map once per collection", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { collect, recording } = yield* builtFiles({
          [builtAppError]: builtModule(builtAppError, [10, 20, 353]),
        });
        const stack = stackAt([
          [builtAppError, 1],
          [builtAppError, 2],
          [builtAppError, 3],
        ]);
        const expected = [appErrorFrame(353), appErrorFrame(20), appErrorFrame(10)];
        expect(yield* collect([stack])).toEqual(expected);
        const afterOne = recording.counts(builtAppError).open;
        expect(yield* collect([stack])).toEqual(expected);
        expect([afterOne, recording.counts(builtAppError).open]).toEqual([1, 2]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("opens no built file for a location that admission rejects", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const uncatalogued = join(cliRoot, "dist/src/invented-owned-file.js");
        const outside = join(cliRoot, "../../../../outside/dist/src/app-error/app-error.js");
        const notJavaScript = join(cliRoot, "dist/src/app-error/app-error.mjs");
        // Each path holds a valid inline map, so only admission keeps it unread.
        const { collect, recording } = yield* builtFiles({
          [uncatalogued]: builtModule(uncatalogued, [1]),
          [outside]: builtModule(outside, [1]),
          [notJavaScript]: builtModule(notJavaScript, [1]),
        });
        const frames = yield* collect([
          stackAt([
            [uncatalogued, 1],
            [outside, 1],
            [notJavaScript, 1],
          ]),
        ]);
        expect(frames).toEqual([]);
        expect(recording.calls({ method: "open" })).toEqual([]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reopens a built file whose open failed and maps its later frames", () =>
    Effect.scoped(
      Effect.gen(function* () {
        let failures = 0;
        const { collect, recording } = yield* builtFiles(
          { [builtAppError]: builtModule(builtAppError, [10, 20, 30]) },
          (path) =>
            path === builtAppError && failures++ === 0
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "Unknown",
                    module: "FileSystem",
                    method: "open",
                    syscall: "open",
                    description: "EMFILE: too many open files",
                    pathOrDescriptor: path,
                  }),
                )
              : Effect.void,
        );
        const frames = yield* collect([
          stackAt([
            [builtAppError, 1],
            [builtAppError, 2],
            [builtAppError, 3],
          ]),
        ]);
        expect(frames).toEqual([appErrorFrame(30), appErrorFrame(20)]);
        expect(
          recording.calls({ path: builtAppError, method: "open" }).map((call) => call.outcome),
        ).toEqual(["failure", "success"]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("opens a built file without an inline map once and admits none of its frames", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { collect, recording } = yield* builtFiles({
          [builtAppError]: builtModule(builtAppError, [10, 20, 30], { withoutMap: true }),
        });
        const frames = yield* collect([
          stackAt([
            [builtAppError, 1],
            [builtAppError, 2],
            [builtAppError, 3],
          ]),
        ]);
        expect(frames).toEqual([]);
        expect(recording.counts(builtAppError).open).toBe(1);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("maps every frame but retains no more than the single-file bound of maps", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const padding = 5 * 1024 * 1024;
        const { collect, recording } = yield* builtFiles({
          [builtAppError]: builtModule(builtAppError, [10, 20], { padding }),
          [builtSourceFrames]: builtModule(builtSourceFrames, [30, 40], { padding }),
        });
        const frames = yield* collect([
          stackAt([
            [builtAppError, 1],
            [builtSourceFrames, 1],
            [builtSourceFrames, 2],
            [builtAppError, 2],
          ]),
        ]);
        const sourceFramesFrame = (line: number) => ({
          ...appErrorFrame(line),
          filename: "src/cli-runtime/source-frames.ts",
        });
        expect(frames).toEqual([
          appErrorFrame(20),
          sourceFramesFrame(40),
          sourceFramesFrame(30),
          appErrorFrame(10),
        ]);
        expect(recording.counts(builtAppError).open).toBe(1);
        expect(recording.counts(builtSourceFrames).open).toBe(2);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("an interrupted collection leaves nothing for the next collection", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const opened = yield* Deferred.make<void>();
        let blocked = true;
        const { collect, recording } = yield* builtFiles(
          { [builtAppError]: builtModule(builtAppError, [10, 20, 30]) },
          (path) =>
            path === builtAppError && blocked
              ? Effect.andThen(Deferred.succeed(opened, undefined), Effect.never)
              : Effect.void,
        );
        const stack = stackAt([
          [builtAppError, 1],
          [builtAppError, 2],
          [builtAppError, 3],
        ]);
        const interrupted = yield* Effect.forkChild(collect([stack]));
        yield* Deferred.await(opened);
        yield* Fiber.interrupt(interrupted);
        blocked = false;
        recording.reset();
        expect(yield* collect([stack])).toEqual([
          appErrorFrame(30),
          appErrorFrame(20),
          appErrorFrame(10),
        ]);
        expect(recording.counts(builtAppError).open).toBe(1);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});

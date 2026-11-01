import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { captureReleaseCommand } from "./release-process.js";
import { makeReleaseSnapshot, releaseRepository } from "./release-runtime.js";

const declaration = (name: string, tags: readonly string[] = ["release:cli"]) =>
  JSON.stringify({ name, tags });
const source = (name: string, dependencies: Record<string, string> = {}) =>
  JSON.stringify({ name, dependencies });
const working = {
  "apps/tool/project.json": declaration("tool", ["role:tooling"]),
  "packages/client/project.json": declaration("client"),
  "packages/client/package.json": source("@test/client", { "@test/model": "workspace:*" }),
  "packages/model/project.json": declaration("model"),
  "packages/model/package.json": source("@test/model"),
};
const historical = {
  "packages/previous/project.json": declaration("previous"),
  "packages/previous/package.json": source("@test/previous"),
};
const denied = PlatformError.systemError({
  _tag: "PermissionDenied",
  module: "FileSystem",
  method: "readFileString",
  pathOrDescriptor: "/repo/packages/model/package.json",
});

const fixture = Effect.fnUntraced(function* (
  options: {
    readonly working?: Readonly<Record<string, string>>;
    readonly denied?: boolean;
    readonly exitCode?: number;
  } = {},
) {
  const files: Readonly<Record<string, string>> = options.working ?? working;
  const calls = yield* Ref.make<readonly (readonly string[])[]>([]);
  const reads = yield* Ref.make<readonly string[]>([]);
  const fs = FileSystem.makeNoop({
    readFileString: (file) =>
      Ref.update(reads, (entries) => [...entries, file]).pipe(
        Effect.andThen(() => {
          if (options.denied && file.endsWith("model/package.json")) return Effect.fail(denied);
          const content = files[file.slice("/repo/".length)];
          return content === undefined
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "NotFound",
                  module: "FileSystem",
                  method: "readFileString",
                  pathOrDescriptor: file,
                }),
              )
            : Effect.succeed(content);
        }),
      ),
  });
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      if (command._tag !== "StandardCommand" || command.command !== "git")
        return yield* Effect.die("Unexpected fixture command");
      const args = command.args.map((arg) => {
        if (typeof arg !== "string") throw new Error("Unexpected redacted fixture argument");
        return arg;
      });
      yield* Ref.update(calls, (entries) => [...entries, args]);
      const historyFiles: Readonly<Record<string, string>> = historical;
      const output =
        args[0] === "ls-files"
          ? Object.keys(files)
              .filter((file) => file.endsWith("project.json"))
              .join("\n")
          : args[0] === "ls-tree"
            ? Object.keys(historical).join("\n")
            : (historyFiles[(args[1] ?? "").slice("exact-ref:".length)] ?? "");
      const stdout = Stream.succeed(new TextEncoder().encode(output));
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(options.exitCode ?? 0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout,
        stderr: Stream.empty,
        all: stdout,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      });
    }),
  );
  const snapshot = (ref?: string) =>
    makeReleaseSnapshot(ref, "/repo").pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.provide(Path.layer),
    );
  return { snapshot, calls, reads };
});

describe("release snapshot ownership", () => {
  it.effect("reads the working cohort on acquisition and retains its injected readers", () =>
    Effect.gen(function* () {
      const { snapshot, reads, calls } = yield* fixture();
      const acquisition = snapshot();
      expect(yield* Ref.get(reads)).toEqual([]);
      expect(yield* Ref.get(calls)).toEqual([]);
      const selected = yield* acquisition;
      expect(selected.packages.map((pkg) => pkg.name)).toEqual(["@test/model", "@test/client"]);
      expect(yield* selected.read("packages/model/package.json")).toBe(
        working["packages/model/package.json"],
      );
      expect(yield* Ref.get(calls)).toEqual([["ls-files", "--", "*project.json"]]);
      expect(yield* Ref.get(reads)).not.toContain("/repo/apps/tool/package.json");
    }),
  );

  it.effect("gets historical membership and descriptors from the exact same ref", () =>
    Effect.gen(function* () {
      const { snapshot, reads, calls } = yield* fixture();
      const selected = yield* snapshot("exact-ref");
      expect(selected.packages.map((pkg) => pkg.name)).toEqual(["@test/previous"]);
      expect(yield* selected.read("packages/previous/package.json")).toBe(
        historical["packages/previous/package.json"],
      );
      expect(yield* Ref.get(reads)).toEqual([]);
      expect(yield* Ref.get(calls)).toEqual([
        ["ls-tree", "-r", "--name-only", "exact-ref"],
        ["show", "exact-ref:packages/previous/project.json"],
        ["show", "exact-ref:packages/previous/package.json"],
        ["show", "exact-ref:packages/previous/package.json"],
      ]);
    }),
  );

  it.effect("keeps denied reads, invalid declarations, and failed commands typed", () =>
    Effect.gen(function* () {
      const refused = yield* fixture({ denied: true });
      expect(yield* Effect.flip(refused.snapshot())).toBe(denied);
      const invalid = yield* fixture({
        working: { ...working, "packages/model/project.json": "{" },
      });
      expect(yield* Effect.flip(invalid.snapshot())).toMatchObject({ _tag: "SchemaError" });
      const failed = yield* fixture({ exitCode: 7 });
      expect(yield* Effect.flip(failed.snapshot())).toMatchObject({
        _tag: "ReleaseCommandFailed",
        exitCode: 7,
      });
      expect(yield* Ref.get(failed.reads)).toEqual([]);
    }),
  );

  it.effect("imports reusable release rules outside a Git checkout without inventory reads", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-release-import-" });
      const imports = [
        "release-cohort.ts",
        "release-shared.ts",
        "release-runtime.ts",
        "release-notes.ts",
      ].map((file) => JSON.stringify(path.join(import.meta.dirname, file)));
      const output = yield* captureReleaseCommand(
        "bun",
        [
          "-e",
          `for (const file of [${imports.join(",")}]) await import(file); console.log("loaded");`,
        ],
        { cwd: directory },
      );
      expect(output).toBe("loaded");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

for (const [entry, args] of [
  ["produce-release-cohort.ts", ["not-a-sha", "output"]],
  ["validate-release-cohort.ts", ["output", "1.2.3", "not-a-sha"]],
  ["resolve-release-meta.ts", ["cli-v1.2.3", "not-a-sha"]],
  ["resolve-release-preparation-source.ts", []],
] as const)
  it.effect(`${entry} validates its commit before acquiring inventory`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-release-arguments-" });
      const child = yield* spawner.spawn(
        ChildProcess.make("bun", [path.join(import.meta.dirname, entry), ...args], {
          cwd: directory,
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: process.env["PATH"] ?? "", AXM_RELEASE_SOURCE_SHA: "not-a-sha" },
        }),
      );
      const [output, exit] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(child.all)), child.exitCode],
        { concurrency: 2 },
      );
      expect(exit).toBe(1);
      expect(output).toContain("requires an exact 40-character lowercase commit SHA");
      expect(output).not.toContain("not a git repository");
      expect(yield* fs.readDirectory(directory)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

describe("release repository configuration", () => {
  for (const [environment, expected] of [
    [{}, "agentxm/axm"],
    [{ GITHUB_REPOSITORY: "" }, "agentxm/axm"],
    [{ GITHUB_REPOSITORY: "fixture/project" }, "fixture/project"],
  ] as const)
    it.effect(`uses ${JSON.stringify(environment)} at acquisition`, () =>
      Effect.gen(function* () {
        expect(
          yield* releaseRepository.pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              ConfigProvider.fromEnvRecord(environment),
            ),
          ),
        ).toBe(expected);
      }),
    );

  it.effect("retains provider failure instead of defaulting", () =>
    Effect.gen(function* () {
      const cause = new ConfigProvider.SourceError({ message: "Configuration unavailable" });
      const failure = yield* Effect.flip(
        releaseRepository.pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.make(() => Effect.fail(cause)),
          ),
        ),
      );
      expect(failure._tag).toBe("ConfigError");
      expect(String(failure)).toContain("Configuration unavailable");
    }),
  );
});

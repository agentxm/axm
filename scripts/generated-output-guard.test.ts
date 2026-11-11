import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { VerificationFailed } from "./verification-process.js";
import type { ProjectGraphProjectNode, TargetConfiguration } from "@nx/devkit";
import {
  collectGeneratedOutputs,
  findGeneratedOutputDrift,
  findGeneratedOutputDriftWithoutMutation,
  mirrorNodeModules,
} from "./generated-output-guard.js";

const temporaryDirectories: Array<string> = [];

const projectNode = (targets: Record<string, TargetConfiguration>): ProjectGraphProjectNode => ({
  name: "client",
  type: "lib",
  data: { root: "packages/client", targets },
});

const isolatedGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

const git = (directory: string, ...args: ReadonlyArray<string>): void => {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    env: isolatedGitEnvironment,
  });
  if (result.status !== 0) throw new Error(result.stderr);
};

const gitText = (directory: string, ...args: ReadonlyArray<string>): string => {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    env: isolatedGitEnvironment,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
};

const makeRepository = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "axm-generated-output-"));
  temporaryDirectories.push(directory);
  git(directory, "init", "--quiet");
  git(directory, "config", "user.email", "generated-output@example.invalid");
  git(directory, "config", "user.name", "Generated output test");
  mkdirSync(join(directory, "generated"));
  writeFileSync(join(directory, "generated", "client.ts"), "export const value = 1;\n");
  writeFileSync(join(directory, "source.ts"), "export const source = 1;\n");
  git(directory, "add", ".");
  git(directory, "commit", "--quiet", "-m", "fixture");
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    chmodSync(directory, 0o700);
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generated output guard", () => {
  it.effect(
    "keeps workspace dependency links inside the snapshot while sharing the external store",
    () =>
      Effect.gen(function* () {
        const source = mkdtempSync(join(tmpdir(), "axm-generated-modules-source-"));
        const snapshot = mkdtempSync(join(tmpdir(), "axm-generated-modules-snapshot-"));
        temporaryDirectories.push(source, snapshot);
        mkdirSync(join(source, "node_modules", ".pnpm"), { recursive: true });
        mkdirSync(join(source, "node_modules", "@agentxm"));
        mkdirSync(join(source, "packages", "core", "extension-model"), { recursive: true });
        mkdirSync(join(snapshot, "packages", "core", "extension-model"), { recursive: true });
        symlinkSync(
          "../../packages/core/extension-model",
          join(source, "node_modules", "@agentxm", "extension-model"),
        );

        yield* mirrorNodeModules(join(source, "node_modules"), join(snapshot, "node_modules"));

        expect(realpathSync(join(snapshot, "node_modules", "@agentxm", "extension-model"))).toBe(
          realpathSync(join(snapshot, "packages", "core", "extension-model")),
        );
        expect(realpathSync(join(snapshot, "node_modules", ".pnpm"))).toBe(
          realpathSync(join(source, "node_modules", ".pnpm")),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it("derives owned outputs from a generate target and its local generator dependencies", () => {
    const outputs = collectGeneratedOutputs(
      projectNode({
        generate: { dependsOn: ["generate:client", "^build"], options: {} },
        "generate:client": {
          dependsOn: [],
          options: { outputPath: "src/__generated__" },
          outputs: ["{projectRoot}/{options.outputPath}", "{workspaceRoot}/schema.json"],
        },
      }),
    );

    expect(outputs).toEqual(["packages/client/src/__generated__", "schema.json"]);
  });

  it("claims no ownership for a target that declares no outputs", () => {
    expect(
      collectGeneratedOutputs(
        projectNode({ generate: { options: { outputPath: "src/__generated__" } } }),
      ),
    ).toEqual([]);
  });

  it.each([
    ["a missing option", "{projectRoot}/{options.outputPath}"],
    ["an unknown token", "{projectRoot}/{outputPath}"],
  ])("fails when a declared output carries %s", (_label, output) => {
    expect(() =>
      collectGeneratedOutputs(projectNode({ generate: { options: {}, outputs: [output] } })),
    ).toThrow(/do not resolve/u);
  });

  it.effect(
    "ignores unrelated dirty files while naming modified, deleted, and added owned outputs",
    () =>
      Effect.gen(function* () {
        const directory = makeRepository();
        writeFileSync(join(directory, "source.ts"), "export const source = 2;\n");
        expect(yield* findGeneratedOutputDrift(directory, ["generated"])).toBe("");

        writeFileSync(join(directory, "generated", "client.ts"), "export const value = 2;\n");
        expect(yield* findGeneratedOutputDrift(directory, ["generated"])).toContain(
          "generated/client.ts",
        );

        writeFileSync(join(directory, "generated", "client.ts"), "export const value = 1;\n");
        unlinkSync(join(directory, "generated", "client.ts"));
        expect(yield* findGeneratedOutputDrift(directory, ["generated"])).toContain(
          "generated/client.ts",
        );

        writeFileSync(join(directory, "generated", "new.ts"), "export const added = true;\n");
        expect(yield* findGeneratedOutputDrift(directory, ["generated"])).toContain(
          "generated/new.ts",
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reports a tracked owned output deleted from the working tree instead of failing to snapshot",
    () =>
      Effect.gen(function* () {
        const directory = makeRepository();
        const generated = join(directory, "generated", "client.ts");
        unlinkSync(generated);
        const beforeStatus = gitText(directory, "status", "--porcelain=v2", "-z");

        const drift = yield* findGeneratedOutputDriftWithoutMutation(
          directory,
          ["generated"],
          (snapshot) =>
            Effect.gen(function* () {
              const fs = yield* FileSystem.FileSystem;
              yield* fs.makeDirectory(join(snapshot, "generated"), { recursive: true });
              yield* fs.writeFileString(
                join(snapshot, "generated", "client.ts"),
                "export const value = 1;\n",
              );
            }),
        );

        expect(drift).toContain("generated/client.ts");
        expect(existsSync(generated)).toBe(false);
        expect(gitText(directory, "status", "--porcelain=v2", "-z")).toBe(beforeStatus);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("detects drift without changing staged, unstaged, or untracked state", () =>
    Effect.gen(function* () {
      const directory = makeRepository();
      const generated = join(directory, "generated", "client.ts");
      const untracked = join(directory, "generated", "new.ts");
      writeFileSync(generated, "export const value = 2;\n");
      git(directory, "add", "generated/client.ts");
      writeFileSync(generated, "export const value = 3;\n");
      writeFileSync(join(directory, "source.ts"), "export const source = 2;\n");
      writeFileSync(untracked, "export const added = true;\n");
      const beforeStatus = gitText(directory, "status", "--porcelain=v2", "-z");
      const beforeGenerated = readFileSync(generated, "utf8");
      const beforeUntracked = readFileSync(untracked, "utf8");

      const drift = yield* findGeneratedOutputDriftWithoutMutation(
        directory,
        ["generated"],
        (snapshot) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            yield* fs.writeFileString(
              join(snapshot, "generated", "client.ts"),
              "export const value = 4;\n",
            );
            yield* fs.remove(join(snapshot, "generated", "new.ts"));
          }),
      );

      expect(drift).toContain("M generated/client.ts");
      expect(drift).toContain("D generated/new.ts");
      expect(gitText(directory, "status", "--porcelain=v2", "-z")).toBe(beforeStatus);
      expect(readFileSync(generated, "utf8")).toBe(beforeGenerated);
      expect(readFileSync(untracked, "utf8")).toBe(beforeUntracked);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("removes the snapshot after generator failure", () =>
    Effect.gen(function* () {
      const directory = makeRepository();
      const entered = yield* Deferred.make<string>();
      const failure = new VerificationFailed({ detail: "generator failed" });
      const result = yield* findGeneratedOutputDriftWithoutMutation(
        directory,
        ["generated"],
        (snapshot) =>
          Deferred.succeed(entered, snapshot).pipe(Effect.andThen(Effect.fail(failure))),
      ).pipe(Effect.result);
      expect(result).toMatchObject({ _tag: "Failure", failure });
      expect(existsSync(yield* Deferred.await(entered))).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("removes a partially copied snapshot when setup fails", () =>
    Effect.gen(function* () {
      const directory = makeRepository();
      const fs = yield* FileSystem.FileSystem;
      const allocated = yield* Deferred.make<string>();
      const failure = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "copy",
      });
      const brokenCopy = FileSystem.make({
        ...fs,
        makeTempDirectory: (options) =>
          fs
            .makeTempDirectory(options)
            .pipe(Effect.tap((root) => Deferred.succeed(allocated, root))),
        copy: () => Effect.fail(failure),
      });
      const result = yield* findGeneratedOutputDriftWithoutMutation(
        directory,
        ["generated"],
        () => Effect.void,
      ).pipe(Effect.provideService(FileSystem.FileSystem, brokenCopy), Effect.result);
      expect(result).toMatchObject({ _tag: "Failure", failure });
      expect(existsSync(yield* Deferred.await(allocated))).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("interrupting generation removes the snapshot before returning", () =>
    Effect.gen(function* () {
      const directory = makeRepository();
      const entered = yield* Deferred.make<string>();
      const fiber = yield* Effect.forkChild(
        findGeneratedOutputDriftWithoutMutation(directory, ["generated"], (snapshot) =>
          Deferred.succeed(entered, snapshot).pipe(Effect.andThen(Effect.never)),
        ),
      );
      const snapshot = yield* Deferred.await(entered);
      yield* Fiber.interrupt(fiber);
      expect(existsSync(snapshot)).toBe(false);
      expect(readFileSync(join(directory, "generated", "client.ts"), "utf8")).toBe(
        "export const value = 1;\n",
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

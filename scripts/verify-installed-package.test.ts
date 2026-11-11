import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import {
  installedVerificationCommand,
  verifyInstalledPackage,
} from "./verify-installed-package.js";
import { VerificationFailed } from "./verification-process.js";

describe("installed package verification", () => {
  it("passes Windows launchers as a single shell script with an isolated environment", () => {
    const env = { PATH: "C:\\tools" };
    const command = installedVerificationCommand(
      "C:\\Program Files\\npm.cmd",
      ["--prefix", "C:\\temp\\isolated root"],
      {
        windows: true,
        cwd: "C:\\temp",
        env,
      },
    );
    expect(command.command).toBe(
      '"C:\\Program Files\\npm.cmd" "--prefix" "C:\\temp\\isolated root"',
    );
    expect(command.args).toEqual([]);
    expect(command.options).toMatchObject({ shell: true, extendEnv: false, env });
  });

  it.effect("resolves a Windows launcher from a Path-only environment", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const commands: ChildProcess.StandardCommand[] = [];
      const checked: string[] = [];
      const fs = FileSystem.makeNoop({
        makeTempDirectory: () => Effect.succeed("C:\\temp\\verification"),
        makeDirectory: () => Effect.void,
        remove: () => Effect.void,
        exists: (candidate) =>
          Effect.sync(() => {
            checked.push(candidate);
            return candidate === "C:\\manager bin\\npm.cmd";
          }),
      });
      const substitute = ChildProcessSpawner.make((command) => {
        if (command._tag !== "StandardCommand")
          return Effect.fail(
            PlatformError.badArgument({
              module: "ChildProcess",
              method: "spawn",
              description: "Unexpected pipeline",
            }),
          );
        commands.push(command);
        return spawner.spawn(
          ChildProcess.make(process.execPath, ["-e", "process.stdout.write('1.2.3')"]),
        );
      });
      yield* verifyInstalledPackage(["npm", "1.2.3"], { Path: "C:\\manager bin" }, "win32").pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, substitute),
      );
      expect(checked).toEqual(["C:\\manager bin\\npm.cmd"]);
      expect(commands[0]?.command).toContain('"C:\\manager bin\\npm.cmd"');
      expect(commands[0]?.options.env).toMatchObject({ PATH: "C:\\manager bin" });
      expect(commands[0]?.options.env).not.toHaveProperty("Path");
    }).pipe(Effect.provide(Layer.merge(NodeServices.layer, NodePath.layerWin32))),
  );

  it.effect("rejects invalid input before acquiring temporary state", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const allocated: string[] = [];
      const observed = FileSystem.make({
        ...fs,
        makeTempDirectory: (options) =>
          fs
            .makeTempDirectory(options)
            .pipe(Effect.tap((root) => Effect.sync(() => allocated.push(root)))),
      });
      const failure = yield* Effect.flip(
        verifyInstalledPackage(["npm", "latest"]).pipe(
          Effect.provideService(FileSystem.FileSystem, observed),
        ),
      );
      expect(failure).toBeInstanceOf(VerificationFailed);
      expect(allocated).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("cleans up a temporary installation when initial directory setup fails", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const allocated = yield* Deferred.make<string>();
      const denied = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "makeDirectory",
      });
      const observed = FileSystem.make({
        ...fs,
        makeTempDirectory: (options) =>
          fs
            .makeTempDirectory(options)
            .pipe(Effect.tap((root) => Deferred.succeed(allocated, root))),
        makeDirectory: () => Effect.fail(denied),
      });
      const failure = yield* Effect.flip(
        verifyInstalledPackage(["npm", "1.2.3"]).pipe(
          Effect.provideService(FileSystem.FileSystem, observed),
        ),
      );
      expect(failure).toBe(denied);
      expect(yield* fs.exists(yield* Deferred.await(allocated))).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  for (const manager of ["npm", "pnpm", "yarn"]) {
    it.effect(`verifies ${manager} in isolation and removes the completed installation`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const commands: ChildProcess.StandardCommand[] = [];
        const substitute = ChildProcessSpawner.make((command) => {
          if (command._tag !== "StandardCommand")
            return Effect.fail(
              PlatformError.badArgument({
                module: "ChildProcess",
                method: "spawn",
                description: "Unexpected pipeline",
              }),
            );
          commands.push(command);
          return spawner.spawn(
            ChildProcess.make(process.execPath, ["-e", "process.stdout.write('1.2.3')"]),
          );
        });
        yield* verifyInstalledPackage(
          [manager, "1.2.3"],
          {
            PATH: "/tools",
            NODE_OPTIONS: "host-only",
            NODE_PATH: "host-only",
            FORCE_COLOR: "1",
            CLICOLOR_FORCE: "1",
          },
          "linux",
        ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, substitute));
        expect(commands).toHaveLength(2);
        const install = commands[0];
        const version = commands[1];
        if (install === undefined || version === undefined || install.options.cwd === undefined)
          return yield* new VerificationFailed({
            detail: "Verification did not execute both commands.",
          });
        expect(install.command).toBe(manager === "yarn" ? "corepack" : manager);
        expect(install.args).toContain("axm.sh@1.2.3");
        expect(install.options.env).not.toHaveProperty("NODE_OPTIONS");
        expect(install.options.env).not.toHaveProperty("NODE_PATH");
        expect(install.options.env).not.toHaveProperty("FORCE_COLOR");
        expect(install.options.env).not.toHaveProperty("CLICOLOR_FORCE");
        expect(install.options.extendEnv).toBe(false);
        const root = path.dirname(install.options.cwd);
        expect(version.command).toBe(path.join(root, "bin", "axm"));
        expect(version.args).toEqual(["--version"]);
        expect(yield* fs.exists(root)).toBe(false);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("stops the installing child and removes its directory on interruption", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const started = yield* Deferred.make<{
        readonly child: ChildProcessSpawner.ChildProcessHandle;
        readonly root: string;
      }>();
      const substitute = ChildProcessSpawner.make((command) => {
        if (command._tag !== "StandardCommand" || command.options.cwd === undefined)
          return Effect.fail(
            PlatformError.badArgument({
              module: "ChildProcess",
              method: "spawn",
              description: "Expected an installation command.",
            }),
          );
        const root = path.dirname(command.options.cwd);
        return spawner
          .spawn(ChildProcess.make(process.execPath, ["-e", "setInterval(() => {}, 1000)"]))
          .pipe(Effect.tap((child) => Deferred.succeed(started, { child, root })));
      });
      const fiber = yield* Effect.forkChild(
        verifyInstalledPackage(["npm", "1.2.3"], {}, "linux").pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, substitute),
        ),
      );
      const { child, root } = yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(yield* child.isRunning).toBe(false);
      expect(yield* fs.exists(root)).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

const verifier = fileURLToPath(new URL("./verify-installed-package.ts", import.meta.url));

describe("published package verification outside the workspace", () => {
  it.each([
    { version: "1.2.3", stderr: "", succeeds: true },
    { version: "1.2.4", stderr: "", succeeds: false },
    { version: "1.2.3", stderr: "unexpected warning", succeeds: false },
  ])("checks the installed executable: $version / $stderr", (scenario) => {
    const root = mkdtempSync(join(tmpdir(), "axm package verifier "));
    const bin = join(root, "manager bin");
    mkdirSync(bin);
    const windows = process.platform === "win32";
    try {
      // Like npm.cmd, this launcher must find a sibling JS entrypoint even
      // when the verifier runs it from an unrelated temporary directory.
      writeFileSync(
        join(bin, windows ? "npm.cmd" : "npm"),
        windows
          ? '@echo off\r\nnode "%~dp0manager.cjs" %*\r\n'
          : '#!/bin/sh\nexec node "$(dirname "$0")/manager.cjs" "$@"\n',
        { mode: 0o755 },
      );
      writeFileSync(
        join(bin, "manager.cjs"),
        `const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
if (args.length !== 5 || args[0] !== "install" || args[1] !== "--global" ||
    args[2] !== "--prefix" || args[4] !== "axm.sh@1.2.3") {
  throw new Error("Unexpected package installation arguments");
}
const bin = process.platform === "win32" ? args[3] : join(args[3], "bin");
mkdirSync(bin, { recursive: true });
writeFileSync(join(bin, "installed.cjs"), ${JSON.stringify(`if (process.argv[2] !== "--version") throw new Error("Unexpected executable arguments");
process.stdout.write(${JSON.stringify(scenario.version)} + "\\n");
process.stderr.write(${JSON.stringify(scenario.stderr)});`)});
writeFileSync(join(bin, process.platform === "win32" ? "axm.cmd" : "axm"),
  process.platform === "win32"
    ? '@echo off\\r\\nnode "%~dp0installed.cjs" %*\\r\\n'
    : '#!/bin/sh\\nexec node "$(dirname "$0")/installed.cjs" "$@"\\n',
  { mode: 0o755 });
`,
      );
      const env = { ...process.env };
      // Windows environment keys are case-insensitive; retain one PATH spelling.
      const inheritedPath = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1];
      for (const key of Object.keys(env)) {
        if (key.toLowerCase() === "path") delete env[key];
      }
      env["PATH"] = `${bin}${delimiter}${inheritedPath ?? ""}`;
      const result = spawnSync("bun", [verifier, "npm", "1.2.3"], {
        env,
        encoding: "utf8",
        timeout: 20_000,
      });
      expect(result.error).toBeUndefined();
      if (scenario.succeeds) {
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("Verified published axm.sh@1.2.3 installed by npm");
      } else {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          "executable did not report exactly 1.2.3 with empty stderr",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

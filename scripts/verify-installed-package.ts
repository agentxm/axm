import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as ChildProcess from "effect/process/ChildProcess";
import * as semver from "semver";
import { runVerificationCommand, VerificationFailed } from "./verification-process.js";

export const installedVerificationCommand = (
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env: Record<string, string | undefined>;
    readonly windows: boolean;
  },
) =>
  options.windows
    ? // cmd requires a single script. Only fixed command names, validated semver,
      // resolved launchers and locally generated paths reach this boundary.
      ChildProcess.make([command, ...args].map((word) => `"${word}"`).join(" "), {
        cwd: options.cwd,
        env: options.env,
        extendEnv: false,
        shell: true,
      })
    : ChildProcess.make(command, args, { cwd: options.cwd, env: options.env, extendEnv: false });

export const verifyInstalledPackage = Effect.fnUntraced(function* (
  args: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
) {
  const [manager, version] = args;
  if (
    (manager !== "npm" && manager !== "pnpm" && manager !== "yarn") ||
    version === undefined ||
    semver.valid(version) !== version ||
    semver.prerelease(version) !== null
  )
    return yield* new VerificationFailed({
      detail: "Expected <npm|pnpm|yarn> <exact-stable-version>.",
    });
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const windows = platform === "win32";
  const delimiter = windows ? ";" : ":";
  const env: Record<string, string | undefined> = {
    ...environment,
    AXM_NO_UPDATE_CHECK: "1",
    AXM_TELEMETRY_DISABLED: "1",
  };
  if (windows) {
    // Windows inherits PATH case-insensitively, including the common `Path`
    // spelling. Keep one key before resolving launchers or extending PNPM_HOME.
    const inheritedPath =
      environment["PATH"] ??
      Object.entries(environment).find(([key]) => key.toLowerCase() === "path")?.[1];
    for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
    if (inheritedPath !== undefined) env["PATH"] = inheritedPath;
  }
  delete env["NODE_OPTIONS"];
  delete env["NODE_PATH"];
  // Nx color overrides conflict with NO_COLOR and make Node emit stderr.
  delete env["FORCE_COLOR"];
  delete env["CLICOLOR_FORCE"];
  const reference = `axm.sh@${version}`;
  yield* Effect.acquireUseRelease(
    fs.makeTempDirectory({ prefix: "axm-installed-package-" }),
    (root) =>
      Effect.gen(function* () {
        const cwd = path.join(root, "outside-workspace");
        yield* fs.makeDirectory(cwd).pipe(Effect.uninterruptible);
        const execute = Effect.fnUntraced(function* (
          executable: string,
          args: ReadonlyArray<string>,
          verify = false,
        ) {
          let command = executable;
          // Resolve batch launchers before changing cwd: npm.cmd locates its own
          // JavaScript entrypoints relative to the launcher's directory.
          if (windows && !path.isAbsolute(executable)) {
            let resolved: string | undefined;
            for (const directory of (env["PATH"] ?? "").split(delimiter)) {
              const candidate = path.resolve(directory, `${executable}.cmd`);
              if (yield* fs.exists(candidate)) {
                resolved = candidate;
                break;
              }
            }
            if (resolved === undefined)
              return yield* new VerificationFailed({
                detail: `Cannot resolve ${executable}.cmd on PATH.`,
              });
            command = resolved;
          }
          const result = yield* runVerificationCommand(
            installedVerificationCommand(command, args, { cwd, env, windows }),
          ).pipe(
            Effect.timeoutOrElse({
              duration: windows && manager === "npm" ? "6 minutes" : "3 minutes",
              orElse: () =>
                Effect.fail(
                  new VerificationFailed({
                    detail: `Installed ${manager} command exceeded its deadline.`,
                  }),
                ),
            }),
          );
          if (verify && (result.stdout.trim() !== version || result.stderr.trim() !== ""))
            return yield* new VerificationFailed({
              detail: `Installed ${manager} executable did not report exactly ${version} with empty stderr: ${JSON.stringify(result)}`,
            });
        });
        if (manager === "npm") {
          yield* execute("npm", ["install", "--global", "--prefix", root, reference]);
        } else if (manager === "pnpm") {
          const bin = path.join(root, "bin");
          yield* fs.makeDirectory(bin).pipe(Effect.uninterruptible);
          env["PNPM_HOME"] = root;
          env["PATH"] = `${bin}${delimiter}${env["PATH"] ?? ""}`;
          yield* execute("pnpm", [
            "add",
            "--global",
            "--global-dir",
            path.join(root, "global"),
            reference,
          ]);
        } else {
          yield* execute("corepack", [
            "yarn@1.22.22",
            "global",
            "add",
            "--prefix",
            root,
            "--global-folder",
            path.join(root, "global"),
            reference,
          ]);
        }
        yield* execute(
          windows ? path.join(root, "axm.cmd") : path.join(root, "bin", "axm"),
          ["--version"],
          true,
        );
      }),
    (root) =>
      fs
        .remove(root, { recursive: true, force: true })
        .pipe(Effect.retry(Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 10 })))),
  );
  yield* Console.log(
    `Verified published ${reference} installed by ${manager} on ${platform}-${process.arch}.`,
  );
});

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath))
  NodeRuntime.runMain(
    verifyInstalledPackage(process.argv.slice(2)).pipe(
      Effect.provide(NodeServices.layer),
      Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
    ),
    { disableErrorReporting: true },
  );

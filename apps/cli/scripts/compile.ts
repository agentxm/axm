import { createRequire } from "node:module";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

export const compileTargets = [
  {
    target: "bun-darwin-arm64",
    nativeAddon: "@napi-rs/keyring-darwin-arm64",
    output: "axm-darwin-arm64",
  },
  {
    target: "bun-darwin-x64",
    nativeAddon: "@napi-rs/keyring-darwin-x64",
    output: "axm-darwin-x64",
  },
  {
    target: "bun-linux-arm64",
    nativeAddon: "@napi-rs/keyring-linux-arm64-gnu",
    output: "axm-linux-arm64",
  },
  {
    target: "bun-linux-x64",
    nativeAddon: "@napi-rs/keyring-linux-x64-gnu",
    output: "axm-linux-x64",
  },
  {
    target: "bun-windows-x64",
    nativeAddon: "@napi-rs/keyring-win32-x64-msvc",
    output: "axm-windows-x64.exe",
  },
] as const;

class CompileError extends Data.TaggedError("CompileError")<{ readonly message: string }> {}

/** Each release target owns one binary; host and development builds own separate directories. */
export const selectCompileTargets = (
  args: ReadonlyArray<string>,
  platform: string,
  architecture: string,
) =>
  Effect.gen(function* () {
    const hostOnly = args.includes("--host-only");
    const devBuild = args.includes("--dev-build");
    const explicit = args.filter((arg) => arg.startsWith("--target="));
    const unknown = args.filter(
      (arg) => !["--host-only", "--dev-build"].includes(arg) && !arg.startsWith("--target="),
    );
    if (
      unknown.length > 0 ||
      explicit.length > 1 ||
      (hostOnly && explicit.length > 0) ||
      (devBuild && !hostOnly)
    ) {
      return yield* new CompileError({
        message:
          "Use --target=bun-<platform>-<architecture>, --host-only, or --host-only --dev-build",
      });
    }
    const targetName = hostOnly
      ? `bun-${platform === "win32" ? "windows" : platform}-${architecture}`
      : explicit[0]?.slice("--target=".length);
    const selected =
      targetName === undefined
        ? compileTargets
        : compileTargets.filter(({ target }) => target === targetName);
    if (selected.length === 0)
      return yield* new CompileError({ message: `Unsupported compile target ${targetName}` });
    return {
      targets: selected,
      output: devBuild ? "dev-bin" : hostOnly ? "host-bin" : "bin",
      devBuild,
      cleanDirectory: hostOnly,
    };
  });

export const compile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const processes = yield* ChildProcessSpawner;
  const packageDir = path.resolve(import.meta.dirname, "..");
  const distDir = path.join(packageDir, "dist");
  const entrypoint = path.join(distDir, "src", "main.js");
  // Bun embeds maps for its input files. Compile TypeScript directly so the
  // executable's map names owned sources rather than the intermediate JS.
  const sourceEntrypoint = path.join(packageDir, "src", "main.ts");
  const request = yield* selectCompileTargets(
    process.argv.slice(2),
    process.platform,
    process.arch,
  );
  const manifest = yield* fs
    .readFileString(path.join(packageDir, "package.json"))
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString })),
        ),
      ),
    );
  let version = manifest.version;
  if (request.devBuild) {
    const git = (args: ReadonlyArray<string>) =>
      processes.string(ChildProcess.make("git", args, { cwd: packageDir, stderr: "ignore" })).pipe(
        Effect.map((value) => value.trim()),
        Effect.option,
      );
    const sha = yield* git(["rev-parse", "--short", "HEAD"]);
    const dirty = yield* git(["status", "--porcelain"]);
    version +=
      Option.isSome(sha) && sha.value.length > 0
        ? `-dev+${sha.value}${Option.isSome(dirty) && dirty.value.length > 0 ? ".dirty" : ""}`
        : "-dev";
  }
  if (!(yield* fs.exists(entrypoint)))
    return yield* new CompileError({
      message: `Build output missing: ${entrypoint}. Run cli:build first.`,
    });
  const outputDir = path.join(distDir, request.output);
  if (request.cleanDirectory) yield* fs.remove(outputDir, { recursive: true, force: true });
  yield* fs.makeDirectory(outputDir, { recursive: true });
  // Sequential compilation keeps Bun's peak memory bounded. Nx controls target concurrency.
  for (const { target, output, nativeAddon } of request.targets) {
    const outfile = path.join(outputDir, output);
    // Never delete sibling release outputs owned by another target.
    yield* fs.remove(outfile, { force: true });
    if (request.output === "host-bin") {
      yield* fs.copyFile(path.join(distDir, "bin", output), outfile);
      yield* Effect.logInfo(`Staged ${output} from its platform producer`);
      continue;
    }
    // The wrapper contains literal requires for each platform. Reject a missing
    // optional addon here rather than shipping a binary that can only fall back.
    yield* Effect.try({
      try: () => {
        const cliRequire = createRequire(path.join(packageDir, "package.json"));
        const registryRequire = createRequire(
          cliRequire.resolve("@agentxm/registry-access/credentials"),
        );
        const keyringRequire = createRequire(registryRequire.resolve("@napi-rs/keyring"));
        return keyringRequire.resolve(nativeAddon);
      },
      catch: () =>
        new CompileError({
          message: `Missing ${nativeAddon} for ${target}; install workspace dependencies with the declared supportedArchitectures before compiling.`,
        }),
    });
    if (target.startsWith("bun-darwin-") && process.platform !== "darwin")
      return yield* new CompileError({
        message:
          "Darwin executable producers require macOS codesign to finalize and verify the compiled signature.",
      });
    yield* Effect.logInfo(`Compiling ${output} (${target})`);
    const code = yield* processes.exitCode(
      ChildProcess.make(
        process.execPath,
        [
          "build",
          "--compile",
          "--sourcemap",
          "--conditions=axm-source",
          `--target=${target}`,
          "--define",
          `__AXM_VERSION__=${Schema.encodeSync(Schema.fromJsonString(Schema.String))(version)}`,
          "--define",
          `__AXM_BUILD_ROOT__=${Schema.encodeSync(Schema.fromJsonString(Schema.String))(path.resolve(packageDir, "../.."))}`,
          sourceEntrypoint,
          "--outfile",
          outfile,
        ],
        { cwd: packageDir, stdout: "inherit", stderr: "inherit" },
      ),
    );
    if (code !== 0)
      return yield* new CompileError({ message: `bun build failed for ${target} (exit ${code})` });
    if (target.startsWith("bun-darwin-")) {
      // Bun's x64 output can retain the upstream executable's invalid signature.
      // Give the finished artifact its own ad-hoc identity before keychain access.
      // Verification belongs to the producer, before any artifact can be cached.
      for (const args of [
        ["--force", "--sign", "-", "--identifier", "ai.agentxm.axm", "--timestamp=none", outfile],
        ["--verify", "--strict", outfile],
      ]) {
        const signatureCode = yield* processes.exitCode(
          ChildProcess.make("/usr/bin/codesign", args, { stdout: "inherit", stderr: "inherit" }),
        );
        if (signatureCode !== 0)
          return yield* new CompileError({
            message: `Could not finalize ${output} code signature (exit ${signatureCode})`,
          });
      }
    }
  }
  yield* Effect.logInfo(
    `Compiled ${request.targets.length} binaries (version ${version}) to ${path.relative(packageDir, outputDir)}`,
  );
});

if (import.meta.main) NodeRuntime.runMain(compile.pipe(Effect.provide(NodeServices.layer)));

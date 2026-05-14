// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — plain Bun build script, not Effect code
import * as fs from "node:fs";
import * as path from "node:path";

const packageDir = path.join(import.meta.dirname, "..");
const distDir = path.join(packageDir, "dist");
const entrypoint = path.join(distDir, "src", "main.js");
const releaseOutputDir = path.join(distDir, "bin");
const devOutputDir = path.join(distDir, "dev-bin");
const packageJsonPath = path.join(packageDir, "package.json");
const args = process.argv.slice(2);
const hostOnly = args.includes("--host-only");
const devBuild = args.includes("--dev-build");
const knownFlags = new Set(["--host-only", "--dev-build"]);
const unknownFlags = args.filter((arg) => arg.startsWith("--") && !knownFlags.has(arg));
const positionalArgs = args.filter((arg) => !arg.startsWith("--"));

if (unknownFlags.length > 0 || positionalArgs.length > 0) {
  throw new Error("Usage: bun scripts/compile.ts [--host-only] [--dev-build]");
}

if (devBuild && !hostOnly) {
  throw new Error("Usage: --dev-build requires --host-only");
}

const outputDir = devBuild ? devOutputDir : releaseOutputDir;

const targets = [
  { target: "bun-darwin-arm64", output: "axm-darwin-arm64" },
  { target: "bun-darwin-x64", output: "axm-darwin-x64" },
  { target: "bun-linux-arm64", output: "axm-linux-arm64" },
  { target: "bun-linux-x64", output: "axm-linux-x64" },
  { target: "bun-windows-x64", output: "axm-windows-x64.exe" },
] as const;

const requireCompileTarget = (targetName: (typeof targets)[number]["target"]) => {
  const compileTarget = targets.find(({ target }) => target === targetName);

  if (compileTarget === undefined) {
    throw new Error(`Unknown compile target ${targetName}`);
  }

  return compileTarget;
};

const resolveHostTarget = () => {
  switch (process.platform) {
    case "darwin":
      if (process.arch === "arm64") {
        return requireCompileTarget("bun-darwin-arm64");
      }

      if (process.arch === "x64") {
        return requireCompileTarget("bun-darwin-x64");
      }

      break;

    case "linux":
      if (process.arch === "arm64") {
        return requireCompileTarget("bun-linux-arm64");
      }

      if (process.arch === "x64") {
        return requireCompileTarget("bun-linux-x64");
      }

      break;

    case "win32":
      if (process.arch === "x64") {
        return requireCompileTarget("bun-windows-x64");
      }

      break;
  }

  throw new Error(`No compile target for host platform ${process.platform}/${process.arch}`);
};

const requestedTargets = hostOnly ? [resolveHostTarget()] : targets;

const packageJson: unknown = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const baseVersion =
  typeof packageJson === "object" &&
  packageJson !== null &&
  "version" in packageJson &&
  typeof packageJson.version === "string" &&
  packageJson.version.length > 0
    ? packageJson.version
    : undefined;

if (baseVersion === undefined) {
  throw new Error(`Expected string version in ${packageJsonPath}`);
}

const tryGit = (gitArgs: ReadonlyArray<string>): string | undefined => {
  const result = Bun.spawnSync(["git", ...gitArgs], {
    cwd: packageDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) return undefined;
  const out = result.stdout?.toString().trim();
  return out !== undefined && out.length > 0 ? out : "";
};

const resolveDevSuffix = (): string => {
  const sha = tryGit(["rev-parse", "--short", "HEAD"]);
  if (sha === undefined) return "-dev";
  const dirty = tryGit(["status", "--porcelain"]);
  const dirtySuffix = dirty !== undefined && dirty.length > 0 ? ".dirty" : "";
  return sha.length > 0 ? `-dev+${sha}${dirtySuffix}` : "-dev";
};

const version = devBuild ? `${baseVersion}${resolveDevSuffix()}` : baseVersion;

if (!fs.existsSync(entrypoint)) {
  throw new Error(`Build output missing: ${entrypoint}. Run cli:build first.`);
}

fs.mkdirSync(outputDir, { recursive: true });

for (const { target, output } of requestedTargets) {
  const outfile = path.join(outputDir, output);
  console.log(`Compiling ${output} (${target})`);

  const result = Bun.spawnSync(
    [
      process.execPath,
      "build",
      "--compile",
      `--target=${target}`,
      "--define",
      `__AXM_VERSION__=${JSON.stringify(version)}`,
      entrypoint,
      "--outfile",
      outfile,
    ],
    {
      cwd: packageDir,
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(`bun build failed for ${target}`);
  }
}

console.log(
  `Compiled ${requestedTargets.length} ${requestedTargets.length === 1 ? "binary" : "binaries"} (version ${version}) to ${path.relative(packageDir, outputDir)}`,
);

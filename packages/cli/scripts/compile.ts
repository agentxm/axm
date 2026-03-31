import * as fs from "node:fs";
import * as path from "node:path";

const packageDir = path.join(import.meta.dirname, "..");
const distDir = path.join(packageDir, "dist");
const entrypoint = path.join(distDir, "src", "main.js");
const outputDir = path.join(distDir, "bin");
const packageJsonPath = path.join(packageDir, "package.json");

const targets = [
  { target: "bun-darwin-arm64", output: "axm-darwin-arm64" },
  { target: "bun-darwin-x64", output: "axm-darwin-x64" },
  { target: "bun-linux-arm64", output: "axm-linux-arm64" },
  { target: "bun-linux-x64", output: "axm-linux-x64" },
  { target: "bun-windows-x64", output: "axm-windows-x64.exe" },
] as const;

const packageJson: unknown = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version =
  typeof packageJson === "object" &&
  packageJson !== null &&
  "version" in packageJson &&
  typeof packageJson.version === "string" &&
  packageJson.version.length > 0
    ? packageJson.version
    : undefined;

if (version === undefined) {
  throw new Error(`Expected string version in ${packageJsonPath}`);
}

if (!fs.existsSync(entrypoint)) {
  throw new Error(`Build output missing: ${entrypoint}. Run cli:build first.`);
}

fs.mkdirSync(outputDir, { recursive: true });

for (const { target, output } of targets) {
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

console.log(`Compiled ${targets.length} binaries to ${path.relative(packageDir, outputDir)}`);

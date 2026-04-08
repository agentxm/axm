// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — plain Bun build script, not Effect code
import * as fs from "node:fs";
import * as path from "node:path";

const packageDir = path.join(import.meta.dirname, "..");
const distDir = path.join(packageDir, "dist");
const entrypoint = path.join(distDir, "src", "main.js");
const outputDir = path.join(distDir, "bin");
const outputName = process.platform === "win32" ? "axm-spike.exe" : "axm-spike";
const outfile = path.join(outputDir, outputName);

if (!fs.existsSync(entrypoint)) {
  throw new Error(`Build output missing: ${entrypoint}. Run cli-spike:build first.`);
}

fs.mkdirSync(outputDir, { recursive: true });

console.log(`Compiling ${path.relative(packageDir, outfile)}`);

const result = Bun.spawnSync(
  [process.execPath, "build", "--compile", entrypoint, "--outfile", outfile],
  {
    cwd: packageDir,
    stdout: "inherit",
    stderr: "inherit",
  },
);

if (result.exitCode !== 0) {
  throw new Error("bun build --compile failed for cli-spike");
}

/**
 * Run diagnostic benchmarks.
 *
 * Benchmarks produce trend evidence for comparison and optimization. They
 * never contribute a behavioral pass count and never satisfy a
 * specification; a required measurable bound belongs to a performance
 * specification instead.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const benchmarksRoot = path.join(repoRoot, "benchmarks");

const hasBenchFiles = (directory: string): boolean => {
  if (!fs.existsSync(directory)) {
    return false;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && hasBenchFiles(entryPath)) {
      return true;
    }
    if (entry.isFile() && entry.name.endsWith(".bench.ts")) {
      return true;
    }
  }
  return false;
};

if (!hasBenchFiles(benchmarksRoot)) {
  console.log("No diagnostic benchmarks are registered under benchmarks/.");
  process.exit(0);
}

const run = spawnSync("pnpm", ["exec", "vitest", "bench", "--run", "--dir", "benchmarks"], {
  cwd: repoRoot,
  stdio: "inherit",
});
process.exit(run.status ?? 1);

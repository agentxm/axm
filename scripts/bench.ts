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
const suite = process.env["AXM_BENCHMARK_SUITE"] ?? "all";
if (suite !== "all" && suite !== "startup" && suite !== "lifecycle" && suite !== "discovery") {
  throw new Error("AXM_BENCHMARK_SUITE must be all, startup, lifecycle, or discovery.");
}
if (suite === "discovery" || suite === "all") {
  const discoveryBenchmark = await import("../benchmarks/discovery.js");
  await discoveryBenchmark.runDiscoveryBenchmark(
    repoRoot,
    process.env["AXM_DISCOVERY_BENCHMARK_OUTPUT"] ??
      path.join(repoRoot, "test-results", "benchmarks", "discovery.json"),
  );
  if (suite === "discovery") process.exit(0);
}
if (suite !== "lifecycle") {
  const startupBenchmark = await import("../benchmarks/cli-startup.js");
  startupBenchmark.runCliStartupBenchmark(
    repoRoot,
    process.env["AXM_BENCHMARK_OUTPUT"] ??
      path.join(repoRoot, "test-results", "benchmarks", "cli-startup.json"),
  );
}

if (suite !== "startup") {
  const lifecycleBenchmark = await import("../benchmarks/lifecycle.js");
  await lifecycleBenchmark.runLifecycleBenchmark(
    repoRoot,
    process.env["AXM_LIFECYCLE_BENCHMARK_OUTPUT"] ??
      path.join(repoRoot, "test-results", "benchmarks", "lifecycle.json"),
  );
}

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

if (suite === "lifecycle" || !hasBenchFiles(benchmarksRoot)) process.exit(0);

const run = spawnSync("pnpm", ["exec", "vitest", "bench", "--run", "--dir", "benchmarks"], {
  cwd: repoRoot,
  stdio: "inherit",
});
process.exit(run.status ?? 1);

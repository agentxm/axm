import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeCacheProfileReport } from "./nx-cache-profile.js";

const [label, ...nxArgs] = process.argv.slice(2);
if (label === undefined || nxArgs.length === 0)
  throw new Error("Usage: bun scripts/profile-nx.ts <label> <nx arguments...>.");
if (!/^[a-z0-9][a-z0-9-]*$/u.test(label)) throw new Error(`Invalid profile label: ${label}.`);

const outputDirectory = "test-results/nx-cache";
mkdirSync(outputDirectory, { recursive: true });
const identity = `${label}-${Date.now()}-${process.pid}`;
const profilePath = join(outputDirectory, `${identity}.profile.json`);
const reportPath = join(outputDirectory, `${identity}.json`);
const bypass = nxArgs.includes("--skip-nx-cache") || process.env["NX_SKIP_NX_CACHE"] === "true";
const commandEnvironment = { ...process.env, NX_PROFILE: profilePath };
const command = spawnSync("pnpm", ["exec", "nx", ...nxArgs], {
  env: commandEnvironment,
  stdio: "inherit",
});
if (command.error) throw command.error;

if (existsSync(profilePath)) {
  const collectionStarted = process.hrtime.bigint();
  const graphEnvironment = { ...process.env };
  delete graphEnvironment["NX_PROFILE"];
  const graphResult = spawnSync("pnpm", ["exec", "nx", "graph", "--file=stdout"], {
    encoding: "utf8",
    env: graphEnvironment,
  });
  if (graphResult.error) throw graphResult.error;
  if (graphResult.status !== 0) throw new Error(graphResult.stderr);
  const overheadMs = Number(process.hrtime.bigint() - collectionStarted) / 1_000_000;
  writeCacheProfileReport({
    bypass,
    collectionOverheadMs: overheadMs,
    graph: JSON.parse(graphResult.stdout),
    label,
    outputPath: reportPath,
    profile: readJson(profilePath),
    profilePath,
    repository: process.env["NX_CACHE_REPOSITORY"] ?? "agentxm/axm",
  });
} else {
  console.warn(`Nx did not produce the requested task profile: ${profilePath}.`);
  writeCacheProfileReport({
    bypass,
    collectionOverheadMs: 0,
    graph: {},
    label,
    outputPath: reportPath,
    profile: [],
    profilePath: null,
    repository: process.env["NX_CACHE_REPOSITORY"] ?? "agentxm/axm",
    telemetryUnavailableReason: "Nx did not produce the requested NX_PROFILE trace.",
  });
}

process.exit(command.status ?? 1);

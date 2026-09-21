/** Controlled lifecycle measurements. The output is diagnostic evidence, never a specification verdict. */

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { makeFileRegistry } from "@agentxm/registry-client/testing";
import * as Effect from "effect/Effect";
import { startLifecycleRegistry, type RequestMetrics } from "./lifecycle-registry.js";

const fixtureVersion = 3;
const fixtureSizes = [1, 10, 50, 200] as const;
const commandTimeoutMs = 600_000;
const archiveBodyDelayMs = 25;
const largeBodyBytes = 2 * 1024 * 1024;
const irrelevantDirectories = 20_000;

class LifecycleBenchmarkError extends Error {
  readonly _tag = "LifecycleBenchmarkError";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const archiveCacheRoot = (userHome: string): string => {
  if (process.platform === "darwin") return path.join(userHome, "Library", "Caches", "axm");
  if (process.platform === "win32") {
    return path.join(userHome, "AppData", "Local", "axm", "cache");
  }
  return path.join(userHome, ".cache", "axm");
};

const largeBody = (): string => {
  const bytes = Buffer.alloc(largeBodyBytes);
  let state = 0x1234abcd;
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes.toString("base64");
};

type Scenario =
  | "cold-configured-install"
  | "cold-configured-sync"
  | "install-preview"
  | "no-op-sync"
  | "sync-preview"
  | "warm-exact-restore"
  | "cold-exact-restore"
  | "changed-version-update-preview"
  | "changed-version-update"
  | "transient-metadata-failure-preview";

interface Sample {
  readonly mode: "control" | "diagnostic";
  readonly scenario: Scenario;
  readonly extensions: number;
  readonly durationMs: number;
  readonly peakRssBytes: number | null;
  readonly exitCode: number;
  readonly outcome: string | null;
  readonly ok: boolean | null;
  readonly planCounts: Readonly<Record<string, number>> | null;
  readonly cacheState: "fresh" | "warm" | "cleared";
  readonly requests: RequestMetrics | null;
}

interface CommandResult {
  readonly durationMs: number;
  readonly peakRssBytes: number | null;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

const selectedSizes = (): ReadonlyArray<number> => {
  const override = process.env["AXM_BENCHMARK_SIZES"];
  if (override === undefined) return fixtureSizes;
  const sizes = override.split(",").map((value) => Number(value.trim()));
  if (
    sizes.length === 0 ||
    sizes.some((size) => !fixtureSizes.some((allowed) => allowed === size))
  ) {
    throw new LifecycleBenchmarkError(
      `AXM_BENCHMARK_SIZES must select from ${fixtureSizes.join(",")}.`,
    );
  }
  return [...new Set(sizes)];
};

const run = (
  builtCli: string,
  workspace: string,
  userHome: string,
  args: ReadonlyArray<string>,
  observeRss: boolean,
) =>
  Effect.tryPromise({
    try: (signal) =>
      new Promise<CommandResult>((resolve, reject) => {
        const started = process.hrtime.bigint();
        const child = spawn("node", [builtCli, ...args], {
          cwd: workspace,
          env: {
            PATH: process.env["PATH"],
            SystemRoot: process.env["SystemRoot"],
            HOME: userHome,
            AXM_USER_HOME: userHome,
            XDG_CACHE_HOME: path.join(userHome, "cache"),
            AXM_NO_UPDATE_CHECK: "1",
            AXM_TELEMETRY: "0",
            CI: "1",
            NO_COLOR: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let peakRssBytes: number | null = null;
        const sampleRss = () => {
          if (process.platform !== "linux") return;
          try {
            const status = fs.readFileSync(`/proc/${child.pid}/status`, "utf8");
            const match = /^VmHWM:\s+(\d+) kB$/m.exec(status);
            if (match !== null) {
              peakRssBytes = Math.max(peakRssBytes ?? 0, Number(match[1]) * 1024);
            }
          } catch {
            // The process may have exited between samples.
          }
        };
        const monitor = observeRss ? setInterval(sampleRss, 20) : undefined;
        let timedOut = false;
        const abort = () => child.kill("SIGKILL");
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        const timeout = setTimeout(() => {
          timedOut = true;
          abort();
        }, commandTimeoutMs);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (code) => {
          signal.removeEventListener("abort", abort);
          if (monitor !== undefined) clearInterval(monitor);
          clearTimeout(timeout);
          resolve({
            durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
            peakRssBytes,
            exitCode: code ?? 1,
            stdout,
            stderr,
            timedOut,
          });
        });
      }),
    catch: (cause) => new LifecycleBenchmarkError(`Benchmark CLI process failed: ${String(cause)}`),
  });

const check = (result: CommandResult, label: string): void => {
  if (result.timedOut) {
    throw new LifecycleBenchmarkError(`${label} exceeded the ${commandTimeoutMs} ms deadline.`);
  }
  if (result.exitCode !== 0) {
    throw new LifecycleBenchmarkError(
      `${label} failed (${result.exitCode}): ${result.stderr.slice(0, 1500)}`,
    );
  }
};

const summaryOf = (stdout: string) => {
  const value: unknown = JSON.parse(stdout);
  if (!isRecord(value) || !isRecord(value["result"])) {
    return { ok: null, outcome: null, planCounts: null };
  }
  const result = value["result"];
  const rawCounts = result["counts"];
  const planCounts = isRecord(rawCounts)
    ? Object.fromEntries(
        Object.entries(rawCounts).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === "number" && Number.isFinite(entry[1]),
        ),
      )
    : null;
  return {
    ok: typeof value["ok"] === "boolean" ? value["ok"] : null,
    outcome: typeof result["outcome"] === "string" ? result["outcome"] : null,
    planCounts,
  };
};

const skillVersion = (canonicalRoot: string): string => {
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(canonicalRoot, "skill.json"), "utf8"),
  );
  if (!isRecord(manifest) || typeof manifest["version"] !== "string") {
    throw new LifecycleBenchmarkError("Benchmark skill manifest has no version.");
  }
  return manifest["version"];
};

const measure = (
  append: (sample: Sample) => void,
  mode: Sample["mode"],
  scenario: Scenario,
  extensions: number,
  cacheState: Sample["cacheState"],
  observation: { readonly result: CommandResult; readonly requests: RequestMetrics | null },
): void => {
  const { result, requests } = observation;
  check(result, scenario);
  const summary = summaryOf(result.stdout);
  append({
    mode,
    scenario,
    extensions,
    durationMs: result.durationMs,
    peakRssBytes: result.peakRssBytes,
    exitCode: result.exitCode,
    ...summary,
    cacheState,
    requests,
  });
};

export const runLifecycleBenchmark = (repoRoot: string, outputPath: string): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const builtCli = path.join(repoRoot, "apps", "cli", "dist", "src", "main.js");
      const packageJson: unknown = JSON.parse(
        fs.readFileSync(path.join(repoRoot, "apps/cli/package.json"), "utf8"),
      );
      if (!isRecord(packageJson) || typeof packageJson["version"] !== "string") {
        throw new LifecycleBenchmarkError("CLI package has no version.");
      }
      const fixtureHash = createHash("sha256");
      for (const relative of ["benchmarks/lifecycle.ts", "benchmarks/lifecycle-registry.ts"]) {
        fixtureHash.update(relative);
        fixtureHash.update(fs.readFileSync(path.join(repoRoot, relative)));
      }
      const fixtureSourceSha256 = fixtureHash.digest("hex");
      const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
      const samples: Array<Sample> = [];
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const append = (sample: Sample): void => {
        samples.push(sample);
        fs.writeFileSync(
          outputPath,
          `${JSON.stringify({ schemaVersion: 1, fixtureVersion, complete: false, fixtureSourceSha256, sourceRevision, sourceVersion: packageJson["version"], samples }, null, 2)}\n`,
        );
      };
      for (const count of selectedSizes()) {
        for (const mode of ["control", "diagnostic"] as const) {
          yield* Effect.acquireUseRelease(
            Effect.gen(function* () {
              const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-lifecycle-bench-"));
              const workspace = path.join(root, "workspace");
              const userHome = path.join(root, "home");
              fs.mkdirSync(workspace);
              fs.mkdirSync(userHome);
              const fixture = makeFileRegistry();
              const registry = yield* Effect.tryPromise({
                try: () => startLifecycleRegistry(fixture.root, archiveBodyDelayMs),
                catch: (cause) =>
                  new LifecycleBenchmarkError(`Registry startup failed: ${String(cause)}`),
              });
              return { root, workspace, userHome, fixture, registry };
            }),
            ({ root, workspace, userHome, fixture, registry }) =>
              Effect.gen(function* () {
                const names = Array.from(
                  { length: count },
                  (_, index) => `bench-${String(index + 1).padStart(3, "0")}`,
                );
                const largeContent = count === 200 ? largeBody() : undefined;
                for (const name of names) {
                  fixture.writeSkill(name, [
                    {
                      version: "1.0.0",
                      body: `${name === names[0] ? (largeContent ?? "") : ""}Baseline ${name}.`,
                    },
                  ]);
                }
                if (count === 10) {
                  const dependencies = {
                    "@acme/skills/bench-001": "*",
                    "@acme/skills/bench-002": "*",
                  };
                  fixture.writePack("bench-pack-a", [{ version: "1.0.0", dependencies }]);
                  fixture.writePack("bench-pack-b", [{ version: "1.0.0", dependencies }]);
                }
                if (count === 200) {
                  const cacheTree = path.join(workspace, ".nx", "cache");
                  for (let index = 0; index < irrelevantDirectories; index += 1) {
                    fs.mkdirSync(path.join(cacheTree, String(index)), { recursive: true });
                  }
                }
                check(
                  yield* run(
                    builtCli,
                    workspace,
                    userHome,
                    ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--json"],
                    false,
                  ),
                  "fixture setup",
                );
                const settingsPath = path.join(workspace, "axm.json");
                const original: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
                if (typeof original !== "object" || original === null || Array.isArray(original)) {
                  throw new LifecycleBenchmarkError("Fixture setup wrote invalid settings.");
                }
                const configuredSettings = `${JSON.stringify({
                  ...original,
                  defaultRegistry: "test",
                  sources: [{ name: "test", type: "registry", location: registry.url }],
                  minimumReleaseAge: "0s",
                  skills: Object.fromEntries(names.map((name) => [name, `@acme/skills/${name}`])),
                  ...(count === 10
                    ? {
                        packs: {
                          "bench-pack-a": "@acme/packs/bench-pack-a",
                          "bench-pack-b": "@acme/packs/bench-pack-b",
                        },
                      }
                    : {}),
                })}\n`;
                fs.writeFileSync(settingsPath, configuredSettings);
                const invokeAt = (
                  targetWorkspace: string,
                  targetHome: string,
                  args: ReadonlyArray<string>,
                ) => {
                  registry.reset(mode === "diagnostic");
                  return Effect.map(
                    run(
                      builtCli,
                      targetWorkspace,
                      targetHome,
                      [...args, "--json", "--non-interactive"],
                      mode === "diagnostic",
                    ),
                    (result) => ({ result, requests: registry.metrics() }),
                  );
                };
                const invoke = (args: ReadonlyArray<string>) => invokeAt(workspace, userHome, args);
                const syncWorkspace = path.join(root, "sync-workspace");
                const syncHome = path.join(root, "sync-home");
                fs.mkdirSync(syncWorkspace);
                fs.mkdirSync(syncHome);
                check(
                  yield* run(
                    builtCli,
                    syncWorkspace,
                    syncHome,
                    ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--json"],
                    false,
                  ),
                  "cold sync fixture setup",
                );
                fs.writeFileSync(path.join(syncWorkspace, "axm.json"), configuredSettings);
                measure(
                  append,
                  mode,
                  "cold-configured-sync",
                  count,
                  "fresh",
                  yield* invokeAt(syncWorkspace, syncHome, ["sync"]),
                );
                measure(
                  append,
                  mode,
                  "install-preview",
                  count,
                  "fresh",
                  yield* invoke(["install", "--preview"]),
                );
                measure(
                  append,
                  mode,
                  "cold-configured-install",
                  count,
                  "fresh",
                  yield* invoke(["install"]),
                );
                measure(
                  append,
                  mode,
                  "sync-preview",
                  count,
                  "warm",
                  yield* invoke(["sync", "--preview"]),
                );
                measure(append, mode, "no-op-sync", count, "warm", yield* invoke(["sync"]));

                const firstName = names[0];
                if (firstName === undefined)
                  throw new LifecycleBenchmarkError("Empty lifecycle fixture.");
                const firstCanonical = path.join(
                  workspace,
                  "agent_extensions",
                  "registry",
                  "@acme",
                  "skills",
                  firstName,
                );
                fs.rmSync(firstCanonical, { recursive: true, force: true });
                measure(append, mode, "warm-exact-restore", count, "warm", yield* invoke(["sync"]));
                fs.rmSync(firstCanonical, { recursive: true, force: true });
                fs.rmSync(archiveCacheRoot(userHome), { recursive: true, force: true });
                measure(
                  append,
                  mode,
                  "cold-exact-restore",
                  count,
                  "cleared",
                  yield* invoke(["sync"]),
                );

                for (const name of names) {
                  fixture.writeSkill(name, [
                    {
                      version: "1.0.0",
                      body: `${name === names[0] ? (largeContent ?? "") : ""}Baseline ${name}.`,
                    },
                    {
                      version: "2.0.0",
                      body: `${name === names[0] ? (largeContent ?? "") : ""}Changed ${name}.`,
                    },
                  ]);
                }
                registry.failNextMetadata(firstName);
                measure(
                  append,
                  mode,
                  "transient-metadata-failure-preview",
                  count,
                  "warm",
                  yield* invoke(["update", "--preview"]),
                );
                measure(
                  append,
                  mode,
                  "changed-version-update-preview",
                  count,
                  "warm",
                  yield* invoke(["update", "--preview"]),
                );
                if (skillVersion(firstCanonical) !== "1.0.0") {
                  throw new LifecycleBenchmarkError("Update preview changed the accepted skill.");
                }
                measure(
                  append,
                  mode,
                  "changed-version-update",
                  count,
                  "warm",
                  yield* invoke(["update"]),
                );
                if (skillVersion(firstCanonical) !== "2.0.0") {
                  throw new LifecycleBenchmarkError(
                    "Update did not select the changed skill version.",
                  );
                }
              }),
            ({ root, fixture, registry }) =>
              Effect.gen(function* () {
                yield* Effect.tryPromise({
                  try: () => registry.close(),
                  catch: (cause) =>
                    new LifecycleBenchmarkError(`Registry shutdown failed: ${String(cause)}`),
                });
                fixture.cleanup();
                fs.rmSync(root, { recursive: true, force: true });
              }),
          );
        }
      }
      for (const count of selectedSizes()) {
        const warm = samples.find(
          (sample) =>
            sample.mode === "diagnostic" &&
            sample.extensions === count &&
            sample.scenario === "warm-exact-restore",
        );
        const cold = samples.find(
          (sample) =>
            sample.mode === "diagnostic" &&
            sample.extensions === count &&
            sample.scenario === "cold-exact-restore",
        );
        if (warm?.requests?.archiveBodies !== 0 || cold?.requests?.archiveBodies !== 1) {
          throw new LifecycleBenchmarkError(
            `Exact restore cache states were not observed at size ${count}.`,
          );
        }
      }
      const report = {
        schemaVersion: 1,
        fixtureVersion,
        complete: true,
        fixtureSourceSha256,
        sourceRevision,
        sourceVersion: packageJson["version"],
        host: {
          platform: process.platform,
          architecture: process.arch,
          kernel: os.release(),
          logicalCpus: os.cpus().length,
          totalMemoryBytes: os.totalmem(),
        },
        toolchain: {
          node: execFileSync("node", ["--version"], { encoding: "utf8" }).trim(),
          bun: Bun.version,
        },
        fixture: {
          source: "loopback HTTP Registry backed by immutable file fixture",
          owner: "@acme",
          sizes: selectedSizes(),
          seed: "0x1234abcd",
          execution: {
            runtime: "built-js",
            agent: "claude-code",
            minimumReleaseAge: "0s",
            registry: "test",
            commandTimeoutMs,
            telemetry: "disabled",
            startupUpdateCheck: "disabled",
          },
          dimensions: {
            shortBody: "One short skill document per extension, with real ZIP integrity.",
            largeBodyAtSize: 200,
            largeBodyBytes,
            irrelevantDirectoryCountAtSize: 200,
            irrelevantDirectories,
            overlappingPacksAtSize: 10,
            overlappingPackCount: 2,
            archiveBodyDelayMs,
          },
        },
        method:
          "One control run without process sampling or request capture, then one diagnostic run per scenario and size. Setup is excluded from timing.",
        unavailableHistoricalEvidence:
          "Earlier raw cold-apply, Git, and production traces are unavailable.",
        samples,
      };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Lifecycle benchmark: ${path.basename(outputPath)}`);
    }),
  );

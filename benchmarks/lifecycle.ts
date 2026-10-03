/** Controlled lifecycle measurements. The output is diagnostic evidence, never a specification verdict. */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

import { makeFileRegistry } from "@agentxm/registry-client/testing";
import * as Effect from "effect/Effect";
import { startLifecycleRegistry, type RequestMetrics } from "./lifecycle-registry.js";
import { startLifecycleGitSource, writeSkillPackage } from "./lifecycle-sources.js";

const fixtureVersion = 11;
const fixtureSizes = [1, 10, 50, 200] as const;
const archiveBodyDelayMs = 25;
const largeBodyBytes = 2 * 1024 * 1024;

class LifecycleBenchmarkError extends Error {
  readonly _tag = "LifecycleBenchmarkError";
}

const selectedCommandTimeoutMs = (): number => {
  const value = Number(process.env["AXM_BENCHMARK_TIMEOUT_MS"] ?? 600_000);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new LifecycleBenchmarkError(
      "AXM_BENCHMARK_TIMEOUT_MS must be a positive integer within the timer range.",
    );
  }
  return value;
};

const commandTimeoutMs = selectedCommandTimeoutMs();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumberRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every((count) => typeof count === "number");

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
  | "warm-configured-install"
  | "ordinary-list"
  | "cold-configured-sync"
  | "install-preview"
  | "no-op-sync"
  | "sync-preview"
  | "warm-exact-restore"
  | "cold-exact-restore"
  | "changed-version-update-preview"
  | "changed-version-update"
  | "transient-metadata-failure-preview"
  | "path-cold-sync"
  | "path-no-op-sync"
  | "git-cold-sync"
  | "git-exact-restore"
  | "git-no-op-sync";

interface Sample {
  readonly workload: "package-count" | "large-content";
  readonly mode: "control" | "diagnostic";
  readonly scenario: Scenario;
  readonly sourceFamily: "registry" | "git" | "path";
  readonly extensions: number;
  readonly durationMs: number;
  readonly peakRssBytes: number | null;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly outcome: string | null;
  readonly ok: boolean | null;
  readonly planCounts: Readonly<Record<string, number>> | null;
  readonly cacheState: "fresh" | "warm" | "cleared";
  readonly requests: RequestMetrics | null;
  readonly nodeApi: NodeApiMetrics | null;
  readonly perClosureWrites: null;
  readonly lockWaitMs: null;
}

interface NodeApiMetrics {
  readonly directoryCalls: number;
  readonly directoryCallsByRoot: Readonly<Record<string, number>>;
  readonly hashBytes: number;
  readonly gitProcesses: number;
  readonly writeCalls: number;
}

interface CommandResult {
  readonly durationMs: number;
  readonly peakRssBytes: number | null;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly nodeApi: NodeApiMetrics | null;
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

/** Select one independent mode when reproducing a failed fixture campaign. */
const selectedModes = (): ReadonlyArray<Sample["mode"]> => {
  const allowed = ["control", "diagnostic"] as const;
  const override = process.env["AXM_BENCHMARK_MODES"];
  if (override === undefined) return allowed;
  const modes = override.split(",").map((value) => value.trim());
  if (modes.some((mode) => !allowed.some((candidate) => candidate === mode))) {
    throw new LifecycleBenchmarkError(
      "AXM_BENCHMARK_MODES must select control, diagnostic, or both.",
    );
  }
  return allowed.filter((mode) => modes.includes(mode));
};

const run = (
  builtCli: string,
  workspace: string,
  userHome: string,
  args: ReadonlyArray<string>,
  observeRss: boolean,
) =>
  Effect.tryPromise({
    try: async (signal): Promise<CommandResult> => {
      const diagnosticsRoot = observeRss
        ? fs.mkdtempSync(path.join(os.tmpdir(), "axm-benchmark-diagnostics-"))
        : undefined;
      const diagnosticsPath =
        diagnosticsRoot === undefined ? undefined : path.join(diagnosticsRoot, "metrics.json");
      let diagnosticsFd: number | undefined;
      try {
        if (diagnosticsPath !== undefined) diagnosticsFd = fs.openSync(diagnosticsPath, "w");
        const preload = path.resolve(
          path.dirname(builtCli),
          "../../../../benchmarks/lifecycle-preload.cjs",
        );
        const started = process.hrtime.bigint();
        const child = Bun.spawn(["node", builtCli, ...args], {
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
            ...(observeRss
              ? {
                  NODE_OPTIONS: `--require=${preload}`,
                  AXM_BENCH_DIAGNOSTICS: "1",
                }
              : {}),
          },
          // A file-backed diagnostic descriptor needs no compatibility stream or
          // close-event accounting. The Node preload still writes its counters to fd 3.
          stdio: ["ignore", "pipe", "pipe", diagnosticsFd ?? "ignore"],
        });
        let timedOut = false;
        const abort = () => child.kill("SIGKILL");
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        const timeout = setTimeout(() => {
          timedOut = true;
          abort();
        }, commandTimeoutMs);
        try {
          const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
          const diagnostics =
            diagnosticsPath === undefined
              ? null
              : parseProcessDiagnostics(fs.readFileSync(diagnosticsPath, "utf8"));
          if (observeRss && !timedOut && diagnostics === null) {
            throw new LifecycleBenchmarkError("The CLI did not report valid diagnostic counters.");
          }
          return {
            durationMs,
            peakRssBytes: diagnostics?.peakRssBytes ?? null,
            exitCode,
            stdout,
            stderr,
            timedOut,
            nodeApi: diagnostics?.nodeApi ?? null,
          };
        } finally {
          signal.removeEventListener("abort", abort);
          clearTimeout(timeout);
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }
      } finally {
        if (diagnosticsFd !== undefined) fs.closeSync(diagnosticsFd);
        if (diagnosticsRoot !== undefined)
          fs.rmSync(diagnosticsRoot, { recursive: true, force: true });
      }
    },
    catch: (cause) => new LifecycleBenchmarkError(`Benchmark CLI process failed: ${String(cause)}`),
  });

const parseProcessDiagnostics = (
  payload: string,
): { readonly peakRssBytes: number; readonly nodeApi: NodeApiMetrics } | null => {
  if (payload.length === 0) return null;
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value["directoryCalls"] !== "number" ||
    !isNumberRecord(value["directoryCallsByRoot"]) ||
    typeof value["hashBytes"] !== "number" ||
    typeof value["gitProcesses"] !== "number" ||
    typeof value["writeCalls"] !== "number" ||
    typeof value["peakRssBytes"] !== "number"
  ) {
    return null;
  }
  return {
    peakRssBytes: value["peakRssBytes"],
    nodeApi: {
      directoryCalls: value["directoryCalls"],
      directoryCallsByRoot: value["directoryCallsByRoot"],
      hashBytes: value["hashBytes"],
      gitProcesses: value["gitProcesses"],
      writeCalls: value["writeCalls"],
    },
  };
};

const probeRegistryIndex = (url: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const request = http.get(url, (response) => {
          response.resume();
          response.once("end", () =>
            response.statusCode === 200
              ? resolve()
              : reject(new Error(`Probe returned ${String(response.statusCode)}`)),
          );
        });
        request.once("error", reject);
      }),
    catch: (cause) => new LifecycleBenchmarkError(`Registry probe failed: ${String(cause)}`),
  });

const check = (result: CommandResult, label: string): void => {
  if (result.timedOut) {
    throw new LifecycleBenchmarkError(`${label} exceeded the ${commandTimeoutMs} ms deadline.`);
  }
  if (result.exitCode !== 0) {
    throw new LifecycleBenchmarkError(
      `${label} failed (${result.exitCode}): ${result.stderr.slice(-1500)}\n${result.stdout.slice(-6000)}`,
    );
  }
};

const summaryOf = (stdout: string) => {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return { ok: null, outcome: null, planCounts: null };
  }
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
  const summary = summaryOf(result.stdout);
  append({
    workload: "package-count",
    mode,
    scenario,
    sourceFamily: scenario.startsWith("git-")
      ? "git"
      : scenario.startsWith("path-")
        ? "path"
        : "registry",
    extensions,
    durationMs: result.durationMs,
    peakRssBytes: result.peakRssBytes,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    ...summary,
    cacheState,
    requests,
    nodeApi: result.nodeApi,
    perClosureWrites: null,
    lockWaitMs: null,
  });
  check(result, scenario);
};

const runSourceScenarios = (
  root: string,
  builtCli: string,
  mode: Sample["mode"],
  append: (sample: Sample) => void,
) =>
  Effect.gen(function* () {
    const prepare = (name: "path" | "git", source: string) =>
      Effect.gen(function* () {
        const workspace = path.join(root, `${name}-workspace`);
        const userHome = path.join(root, `${name}-home`);
        fs.mkdirSync(workspace, { recursive: true });
        fs.mkdirSync(userHome, { recursive: true });
        check(
          yield* run(
            builtCli,
            workspace,
            userHome,
            ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--json"],
            false,
          ),
          `${name} fixture setup`,
        );
        const settingsPath = path.join(workspace, "axm.json");
        const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        if (!isRecord(settings)) {
          throw new LifecycleBenchmarkError(`${name} setup wrote invalid settings.`);
        }
        fs.writeFileSync(
          settingsPath,
          `${JSON.stringify({ ...settings, skills: { [`bench-${name}`]: source } })}\n`,
        );
        return { workspace, userHome };
      });
    const invoke = (workspace: string, userHome: string, args: ReadonlyArray<string>) =>
      Effect.map(
        run(
          builtCli,
          workspace,
          userHome,
          [...args, "--json", "--non-interactive"],
          mode === "diagnostic",
        ),
        (result) => ({ result, requests: null }),
      );

    const pathWorkspace = path.join(root, "path-workspace");
    writeSkillPackage(pathWorkspace, "bench-path", "Accepted path guidance.");
    const pathFixture = yield* prepare("path", "./vendor/bench-path");
    measure(
      append,
      mode,
      "path-cold-sync",
      1,
      "fresh",
      yield* invoke(pathFixture.workspace, pathFixture.userHome, ["sync"]),
    );
    measure(
      append,
      mode,
      "path-no-op-sync",
      1,
      "warm",
      yield* invoke(pathFixture.workspace, pathFixture.userHome, ["sync"]),
    );

    yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => startLifecycleGitSource(root),
        catch: (cause) =>
          new LifecycleBenchmarkError(`Git fixture startup failed: ${String(cause)}`),
      }),
      (git) =>
        Effect.gen(function* () {
          const fixture = yield* prepare("git", git.url);
          measure(
            append,
            mode,
            "git-cold-sync",
            1,
            "fresh",
            yield* invoke(fixture.workspace, fixture.userHome, ["sync"]),
          );
          const accepted = fs.readFileSync(path.join(fixture.workspace, "axm-lock.yaml"), "utf8");
          const canonical = path.join(
            fixture.workspace,
            "agent_extensions",
            "git",
            "@acme",
            "skills",
            "bench-git",
          );
          fs.rmSync(canonical, { recursive: true, force: true });
          git.advance();
          measure(
            append,
            mode,
            "git-exact-restore",
            1,
            "warm",
            yield* invoke(fixture.workspace, fixture.userHome, ["sync"]),
          );
          if (
            fs.readFileSync(path.join(canonical, "src", "SKILL.md"), "utf8").includes("New Git") ||
            fs.readFileSync(path.join(fixture.workspace, "axm-lock.yaml"), "utf8") !== accepted
          ) {
            throw new LifecycleBenchmarkError("Git restore changed the accepted identity.");
          }
          measure(
            append,
            mode,
            "git-no-op-sync",
            1,
            "warm",
            yield* invoke(fixture.workspace, fixture.userHome, ["sync"]),
          );
        }),
      (git) =>
        Effect.tryPromise({
          try: () => git.close(),
          catch: (cause) =>
            new LifecycleBenchmarkError(`Git fixture shutdown failed: ${String(cause)}`),
        }),
    );
  });

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
      for (const relative of [
        "benchmarks/lifecycle.ts",
        "benchmarks/lifecycle-registry.ts",
        "benchmarks/lifecycle-sources.ts",
        "benchmarks/lifecycle-preload.cjs",
      ]) {
        fixtureHash.update(relative);
        fixtureHash.update(fs.readFileSync(path.join(repoRoot, relative)));
      }
      const fixtureSourceSha256 = fixtureHash.digest("hex");
      const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
      const sourceDirty =
        execFileSync("git", ["status", "--porcelain"], {
          cwd: repoRoot,
          encoding: "utf8",
        }).trim().length > 0;
      const samples: Array<Sample> = [];
      let duplicateRequestProbe = false;
      let serializationProbe = false;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const appendSample = (sample: Sample): void => {
        samples.push(sample);
        fs.writeFileSync(
          outputPath,
          `${JSON.stringify({ schemaVersion: 1, fixtureVersion, complete: false, fixtureSourceSha256, sourceRevision, sourceDirty, sourceVersion: packageJson["version"], commandTimeoutMs, samples }, null, 2)}\n`,
        );
      };
      const workloads = [
        ...selectedSizes().map((count) => ({ count, workload: "package-count" as const })),
        ...(selectedSizes().includes(1) ? [{ count: 1, workload: "large-content" as const }] : []),
      ];
      for (const { count, workload } of workloads) {
        const append = (sample: Sample): void => appendSample({ ...sample, workload });
        const lifecycleVariants = count === 1 && workload === "package-count";
        for (const mode of selectedModes()) {
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
                const largeContent = workload === "large-content" ? largeBody() : undefined;
                for (const name of names) {
                  fixture.writeSkill(name, [
                    {
                      version: "1.0.0",
                      body: `${name === names[0] ? (largeContent ?? "") : ""}Baseline ${name}.`,
                    },
                  ]);
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
                if (lifecycleVariants) {
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
                }
                measure(
                  append,
                  mode,
                  "cold-configured-install",
                  count,
                  "fresh",
                  yield* invoke(["install"]),
                );
                if (lifecycleVariants) {
                  measure(
                    append,
                    mode,
                    "sync-preview",
                    count,
                    "warm",
                    yield* invoke(["sync", "--preview"]),
                  );
                  measure(append, mode, "no-op-sync", count, "warm", yield* invoke(["sync"]));
                }
                measure(
                  append,
                  mode,
                  "warm-configured-install",
                  count,
                  "warm",
                  yield* invoke(["install"]),
                );
                measure(append, mode, "ordinary-list", count, "warm", yield* invoke(["list"]));

                const firstName = names[0];
                if (firstName === undefined)
                  throw new LifecycleBenchmarkError("Empty lifecycle fixture.");
                if (lifecycleVariants) {
                  const firstCanonical = path.join(
                    workspace,
                    "agent_extensions",
                    "registry",
                    "@acme",
                    "skills",
                    firstName,
                  );
                  fs.rmSync(firstCanonical, { recursive: true, force: true });
                  measure(
                    append,
                    mode,
                    "warm-exact-restore",
                    count,
                    "warm",
                    yield* invoke(["sync"]),
                  );
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
                  if (count === 1) {
                    yield* runSourceScenarios(root, builtCli, mode, append);
                  }
                }
                if (
                  mode === "diagnostic" &&
                  workload === "package-count" &&
                  count === selectedSizes()[0]
                ) {
                  registry.reset(true);
                  const probeUrl = `${registry.url}/v1/extensions/@acme/skills/${firstName}`;
                  yield* probeRegistryIndex(probeUrl);
                  yield* probeRegistryIndex(probeUrl);
                  const probe = registry.metrics();
                  if (probe?.requests !== 2 || probe.uniqueKeys !== 1 || probe.repeatedKeys !== 1) {
                    throw new LifecycleBenchmarkError("Duplicate request metric did not change.");
                  }
                  duplicateRequestProbe = true;
                  const archiveUrl = `${probeUrl}/1.0.0/archive`;
                  registry.reset(true);
                  yield* Effect.all(
                    [probeRegistryIndex(archiveUrl), probeRegistryIndex(archiveUrl)],
                    { concurrency: 2 },
                  );
                  const concurrent = registry.metrics();
                  registry.reset(true);
                  yield* probeRegistryIndex(archiveUrl);
                  yield* probeRegistryIndex(archiveUrl);
                  const serialized = registry.metrics();
                  if (
                    concurrent?.peakActiveArchiveBodies !== 2 ||
                    serialized?.peakActiveArchiveBodies !== 1
                  ) {
                    throw new LifecycleBenchmarkError(
                      "Archive concurrency metric did not distinguish serialized requests.",
                    );
                  }
                  serializationProbe = true;
                  registry.reset(false);
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
      for (const count of selectedModes().includes("diagnostic") && selectedSizes().includes(1)
        ? [1]
        : []) {
        const warm = samples.find(
          (sample) =>
            sample.mode === "diagnostic" &&
            sample.workload === "package-count" &&
            sample.extensions === count &&
            sample.scenario === "warm-exact-restore",
        );
        const cold = samples.find(
          (sample) =>
            sample.mode === "diagnostic" &&
            sample.workload === "package-count" &&
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
        schemaVersion: 2,
        fixtureVersion,
        complete: true,
        fixtureSourceSha256,
        sourceRevision,
        sourceDirty,
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
          git: execFileSync("git", ["--version"], { encoding: "utf8" }).trim(),
        },
        fixture: {
          sources: ["loopback HTTP Registry", "local path", "loopback Git daemon"],
          owner: "@acme",
          sizes: selectedSizes(),
          modes: selectedModes(),
          workloads,
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
            largeBodyWorkload: { name: "large-content", extensions: 1 },
            largeBodyBytes,
            lifecycleVariantsAtSize: 1,
            archiveBodyDelayMs,
            sourceFamilyCasesAtSize: 1,
          },
        },
        method:
          "One run per selected mode, scenario and size; when both modes are selected, control precedes diagnostic. Control excludes diagnostic preloading and request capture. Diagnostic RSS comes from Node process.resourceUsage().maxRSS, converted from KiB to bytes; counters are collected through a temporary file descriptor outside the workspace. Setup is excluded from timing. Directory/write counts intercept Node filesystem APIs, hash bytes count node:crypto Hash.update input, and Git process counts intercept child_process spawn/execFile; these are not physical I/O totals.",
        unavailableMetrics: {
          perClosureWrites: "The current CLI exposes no closure-attributed write counter.",
          lockWaitMs: "The current CLI exposes no lock acquisition timer to this runner.",
        },
        counterChecks: {
          duplicateMetadataRequest: duplicateRequestProbe ? "passed" : "not-run",
          serializedArchiveRequests: serializationProbe ? "passed" : "not-run",
        },
        unavailableHistoricalEvidence:
          "Earlier raw cold-apply, Git, and production traces are unavailable.",
        samples,
      };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Lifecycle benchmark: ${path.basename(outputPath)}`);
    }),
  );

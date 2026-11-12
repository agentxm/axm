/** Diagnostic matrix: real compiled CLI and Toxiproxy, synthetic local Registry. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Data from "effect/Data";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import { resolveAxmCacheRootPure } from "@agentxm/host-primitives";
import { controlNetwork } from "../scripts/registry-network/control.js";
import { startLifecycleRegistry } from "./lifecycle-registry.js";

class BenchmarkError extends Data.TaggedError("NetworkBenchmarkError")<{
  readonly message: string;
}> {}
const Receipt = Schema.Struct({ traceId: Schema.String, spanId: Schema.String });
const program = Effect.gen(function* () {
  const binary = path.resolve(
    process.env["AXM_NETWORK_BINARY"] ??
      `apps/cli/dist/host-bin/axm-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`,
  );
  const output = path.resolve(
    process.env["AXM_NETWORK_OUTPUT"] ?? "test-results/benchmarks/registry-network.json",
  );
  const repetitions = Number(process.env["AXM_NETWORK_REPETITIONS"] ?? 3);
  const sizes = (process.env["AXM_NETWORK_SIZES"] ?? "10").split(",").map(Number);
  if (
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 10 ||
    new Set(sizes).size !== sizes.length ||
    sizes.some((size) => ![1, 10, 50].includes(size))
  ) {
    return yield* new BenchmarkError({
      message: "Use repetitions 1..10 and sizes selected from 1,10,50.",
    });
  }
  // Never pair a fresh timing run with receipts left by an older invocation.
  if (fs.existsSync(output) || fs.existsSync(`${output}.receipts`)) {
    return yield* new BenchmarkError({
      message:
        "Benchmark output or receipts already exist; choose an unused AXM_NETWORK_OUTPUT path.",
    });
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-network-matrix-"));
  const owner = path.join(root, "proxy-owner");
  const api = process.env["AXM_REGISTRY_NETWORK_API"] ?? "http://127.0.0.1:8474";
  const port = Number(process.env["AXM_NETWORK_PORT"] ?? 18089);
  const origin = `http://127.0.0.1:${port}`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(`${output}.receipts`, { recursive: true });
  const samples: unknown[] = [];
  const provenance = {
    schemaVersion: 1,
    binary,
    binarySha256: createHash("sha256").update(fs.readFileSync(binary)).digest("hex"),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
    host: { platform: os.platform(), arch: os.arch(), release: os.release() },
    repetitions,
    sizes,
    archiveBodyDelayMs: 100,
    upstream: "synthetic loopback Registry",
    cacheMeaning:
      "cold: archive cache cleared; warm: archives preseeded; every sample is a fresh process and copied workspace",
  };
  const save = (complete: boolean) =>
    fs.writeFileSync(output, `${JSON.stringify({ ...provenance, complete, samples }, null, 2)}\n`);
  const invoke = (workspace: string, home: string, args: ReadonlyArray<string>, receipt?: string) =>
    Effect.tryPromise({
      try: async (signal) => {
        const started = performance.now();
        const child = Bun.spawn([binary, ...args, "--json", "--non-interactive"], {
          cwd: workspace,
          env: {
            PATH: process.env["PATH"],
            HOME: home,
            AXM_USER_HOME: home,
            XDG_CACHE_HOME: path.join(home, "cache"),
            AXM_NO_UPDATE_CHECK: "1",
            AXM_TELEMETRY: "0",
            CI: "1",
            NO_COLOR: "1",
            ...(receipt === undefined ? {} : { AXM_TRACE: "1", AXM_TRACE_RECEIPT: receipt }),
          },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        });
        const abort = () => child.kill("SIGKILL");
        signal.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 120_000);
        try {
          const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          if (exitCode !== 0)
            throw new BenchmarkError({
              message: `${args.join(" ")} failed (${exitCode}): ${stderr.slice(0, 1500)} ${stdout.slice(0, 1500)}`,
            });
          return {
            durationMs: performance.now() - started,
            exitCode,
            trace:
              receipt === undefined
                ? null
                : Schema.decodeUnknownSync(Schema.fromJsonString(Receipt))(
                    fs.readFileSync(receipt, "utf8"),
                  ),
          };
        } finally {
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
        }
      },
      catch: (cause) => new BenchmarkError({ message: String(cause) }),
    });
  const copy = (from: string, to: string) =>
    fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  const clearCache = (home: string) => {
    const cache = resolveAxmCacheRootPure(path.join, process.platform, home, { axmUserHome: home });
    fs.rmSync(cache, { recursive: true, force: true });
  };
  save(false);
  yield* Effect.gen(function* () {
    for (const count of sizes) {
      const fixture = makeFileRegistry();
      const registry = yield* Effect.tryPromise({
        try: () => startLifecycleRegistry(fixture.root, 100),
        catch: (cause) => new BenchmarkError({ message: String(cause) }),
      });
      yield* Effect.gen(function* () {
        const profile = (name: "baseline" | "typical" | "slow") =>
          Effect.gen(function* () {
            yield* controlNetwork({ action: "stop", worktree: owner, api });
            return yield* controlNetwork({
              action: "start",
              worktree: owner,
              api,
              upstream: registry.url,
              port,
              profile: name,
            });
          });
        yield* profile("baseline");
        const names = Array.from(
          { length: count },
          (_, i) => `bench-${String(i + 1).padStart(3, "0")}`,
        );
        for (const name of names)
          fixture.writeSkill(name, [{ version: "1.0.0", body: `Baseline ${name}.` }]);
        const templates = path.join(root, `templates-${count}`);
        const empty = path.join(templates, "empty");
        const installed = path.join(templates, "installed");
        const home = path.join(templates, "home");
        fs.mkdirSync(empty, { recursive: true });
        fs.mkdirSync(home, { recursive: true });
        yield* invoke(empty, home, [
          "setup",
          "--yes",
          "--scope",
          "project",
          "--agent",
          "claude-code",
        ]);
        fs.writeFileSync(
          path.join(empty, "axm.json"),
          JSON.stringify({
            agents: ["claude-code"],
            defaultRegistry: "test",
            minimumReleaseAge: "0s",
            sources: [{ name: "test", type: "registry", location: origin }],
            skills: Object.fromEntries(names.map((name) => [name, `@acme/skills/${name}`])),
          }),
        );
        copy(empty, installed);
        yield* invoke(installed, home, ["sync"]);
        const warmOne = path.join(templates, "warm-one");
        copy(home, warmOne);
        const restore = path.join(templates, "restore");
        copy(installed, restore);
        fs.rmSync(path.join(restore, "agent_extensions"), { recursive: true, force: true });
        for (const name of names)
          fixture.writeSkill(name, [
            { version: "1.0.0", body: `Baseline ${name}.` },
            { version: "2.0.0", body: `Updated ${name}.` },
          ]);
        const updated = path.join(templates, "updated");
        copy(installed, updated);
        yield* invoke(updated, home, ["update"]);
        const warmBoth = path.join(templates, "warm-both");
        copy(home, warmBoth);
        // Install always selects v2; sync restores accepted v1; update moves v1 to v2.
        const cases = [
          { operation: "list", args: ["list"], source: installed, cache: warmOne },
          {
            operation: "view",
            args: ["view", "@acme/skills/bench-001"],
            source: installed,
            cache: warmOne,
          },
          {
            operation: "install",
            args: ["install", "@acme/skills/bench-001"],
            source: empty,
            cache: warmBoth,
          },
          { operation: "sync-restore", args: ["sync"], source: restore, cache: warmOne },
          { operation: "sync-noop", args: ["sync"], source: installed, cache: warmOne },
          { operation: "update", args: ["update"], source: installed, cache: warmBoth },
        ];
        for (let repeat = 0; repeat <= repetitions; repeat += 1) {
          const traced = repeat === repetitions;
          const profiles = ["baseline", "typical", "slow"] as const;
          for (let offset = 0; offset < profiles.length; offset += 1) {
            const selected = profiles[(repeat + offset) % profiles.length];
            if (selected === undefined) continue;
            const configured = yield* profile(selected);
            for (const scenario of cases)
              for (const cacheState of ["cold", "warm"]) {
                const id = `${count}-${selected}-${scenario.operation}-${cacheState}-${repeat}`;
                const sampleRoot = path.join(root, id);
                const workspace = path.join(sampleRoot, "workspace");
                const sampleHome = path.join(sampleRoot, "home");
                fs.mkdirSync(sampleRoot);
                copy(scenario.source, workspace);
                copy(scenario.cache, sampleHome);
                if (cacheState === "cold") clearCache(sampleHome);
                const receipt = traced ? path.join(`${output}.receipts`, `${id}.json`) : undefined;
                registry.reset(true);
                const result = yield* invoke(workspace, sampleHome, scenario.args, receipt);
                samples.push({
                  id,
                  count,
                  profile: selected,
                  cacheState,
                  operation: scenario.operation,
                  repeat,
                  traced,
                  ...result,
                  proxy: configured,
                  requests: registry.metrics(),
                  timeline: registry.timeline(),
                });
                save(false);
                console.log(
                  `${id}: ${result.durationMs.toFixed(0)}ms, ${registry.metrics()?.requests} requests`,
                );
                fs.rmSync(sampleRoot, { recursive: true, force: true });
              }
          }
        }
      }).pipe(
        Effect.ensuring(
          Effect.promise(async () => {
            await registry.close();
            fixture.cleanup();
          }),
        ),
      );
    }
    save(true);
  }).pipe(
    Effect.ensuring(controlNetwork({ action: "stop", worktree: owner, api }).pipe(Effect.ignore)),
    Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
  );
});

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
  ),
);

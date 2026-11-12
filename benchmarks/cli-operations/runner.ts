import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import { benchmarkProcessEnvironment } from "../process-environment.js";
import type {
  BenchmarkScenario,
  InvocationOptions,
  ProcessResult,
  ScenarioContext,
} from "./fixtures.js";

export class BenchmarkProcessFailure extends Data.TaggedError("BenchmarkProcessFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
export class BenchmarkScenarioFailure extends Data.TaggedError("BenchmarkScenarioFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Bun reports operating-system resource usage of the actual compiled child. */
export const invokeCompiled = (
  binary: string,
  workspace: string,
  home: string,
  args: ReadonlyArray<string>,
  options: InvocationOptions = {},
): Effect.Effect<ProcessResult, BenchmarkProcessFailure> =>
  Effect.tryPromise({
    try: async (signal) => {
      const started = performance.now();
      const child = Bun.spawn(
        [...(options.processWrapper ?? []), options.binary ?? binary, ...args],
        {
          cwd: options.cwd ?? workspace,
          env: { ...benchmarkProcessEnvironment(home), ...options.env },
          stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const abort = (): void => {
        child.kill("SIGKILL");
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        abort();
      }, 120_000);
      try {
        const [exitCode, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        const durationMs = performance.now() - started;
        if (timedOut)
          throw new BenchmarkProcessFailure({
            message: `Timed out: ${args.join(" ")}\n${stdout}\n${stderr}`,
          });
        const usage = child.resourceUsage();
        return {
          durationMs,
          exitCode,
          stdout,
          stderr,
          cpuUserMs: usage === undefined ? null : Number(usage.cpuTime.user) / 1_000,
          cpuSystemMs: usage === undefined ? null : Number(usage.cpuTime.system) / 1_000,
          peakRssBytes: usage?.maxRSS ?? null,
          // getrusage's block operation counts are not byte counters. Never label them as bytes.
          ioReadBytes: null,
          ioWriteBytes: null,
        };
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    },
    catch: (cause) =>
      cause instanceof BenchmarkProcessFailure
        ? cause
        : new BenchmarkProcessFailure({ message: String(cause), cause }),
  });

/** Each call obtains wholly fresh workspace, home, application, and package-cache state. */
export const runScenarioSample = (
  scenario: BenchmarkScenario,
  repoRoot: string,
  binary: string,
  options: {
    readonly processWrapper?: ReadonlyArray<string>;
    readonly subject?: "baseline" | "candidate";
  } = {},
): Effect.Effect<
  ProcessResult & {
    readonly args: ReadonlyArray<string>;
    readonly expectedExitCode: number;
    readonly metrics: Readonly<Record<string, number>>;
  },
  BenchmarkScenarioFailure
> =>
  Effect.tryPromise({
    try: async (signal) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "axm-operation-benchmark-"));
      const workspace = path.join(root, "workspace");
      const home = path.join(root, "home");
      await Promise.all([fs.mkdir(workspace), fs.mkdir(home)]);
      const context: ScenarioContext = {
        subject: options.subject ?? "candidate",
        repoRoot,
        binary,
        root,
        workspace,
        home,
        run: (args, options) =>
          Effect.runPromise(invokeCompiled(binary, workspace, home, args, options), { signal }),
      };
      try {
        const invocation = await scenario.prepare(context);
        try {
          const result = await context.run(invocation.args, { ...invocation, ...options });
          if (result.exitCode !== invocation.expectedExitCode) {
            throw new BenchmarkScenarioFailure({
              message: `${scenario.id}: expected exit ${invocation.expectedExitCode}, got ${result.exitCode}\n${result.stdout}\n${result.stderr}`,
            });
          }
          const metrics = invocation.metrics?.() ?? {};
          await invocation.verify(result);
          return {
            ...result,
            args: invocation.args,
            expectedExitCode: invocation.expectedExitCode,
            metrics,
          };
        } finally {
          await invocation.dispose?.();
        }
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
    catch: (cause) =>
      cause instanceof BenchmarkScenarioFailure
        ? cause
        : new BenchmarkScenarioFailure({ message: String(cause), cause }),
  });

export const binaryIdentity = async (binary: string): Promise<string> =>
  createHash("sha256")
    .update(await fs.readFile(binary))
    .digest("hex");

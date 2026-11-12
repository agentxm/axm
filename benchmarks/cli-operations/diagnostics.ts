import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import type { BenchmarkScenario } from "./fixtures.js";
import { runScenarioSample } from "./runner.js";

export interface SyscallObservation {
  readonly calls: number;
  readonly errors: number;
}

class SyscallDiagnosticFailed extends Data.TaggedError("SyscallDiagnosticFailed")<{
  readonly cause: unknown;
}> {}

/** strace summary counts are system calls, never bytes or semantic parse counts. */
export const parseSyscallSummary = (
  summary: string,
): Readonly<Record<string, SyscallObservation>> => {
  const observations: Record<string, SyscallObservation> = {};
  for (const line of summary.split("\n")) {
    const match = /^\s*[\d.]+\s+[\d.]+\s+\d+\s+(\d+)\s+(?:(\d+)\s+)?([a-z][a-z0-9_]*)\s*$/u.exec(
      line,
    );
    if (match === null) continue;
    const syscall = match[3];
    if (syscall === undefined || syscall === "total") continue;
    const calls = Number(match[1]);
    const errors = Number(match[2] ?? 0);
    if (!Number.isSafeInteger(calls) || !Number.isSafeInteger(errors) || errors > calls)
      throw new Error("Invalid syscall summary counts");
    if (observations[syscall] !== undefined)
      throw new Error(`Duplicate syscall summary row ${syscall}`);
    observations[syscall] = { calls, errors };
  }
  if (Object.keys(observations).length === 0)
    throw new Error("No syscall evidence in diagnostic output");
  return observations;
};

/** Same scenario and verification, separate process; never included in timing distributions. */
export const diagnoseScenario = (
  scenario: BenchmarkScenario,
  repoRoot: string,
  binary: string,
  tracePath: string,
  subject: "baseline" | "candidate" = "candidate",
) =>
  Effect.gen(function* () {
    if (process.platform !== "linux")
      return {
        status: "unavailable" as const,
        reason: "strace diagnostics require Linux; host-native diagnostics are separate evidence",
      };
    yield* Effect.tryPromise({
      try: () => fs.mkdir(path.dirname(tracePath), { recursive: true }),
      catch: (cause) => new SyscallDiagnosticFailed({ cause }),
    });
    const result = yield* runScenarioSample(scenario, repoRoot, binary, {
      subject,
      processWrapper: [
        "strace",
        "-f",
        "-c",
        "-e",
        "trace=%file,read,pread64,readv,write,pwrite64,writev,getdents64,fsync,fdatasync",
        "-o",
        tracePath,
      ],
    });
    const summary = yield* Effect.tryPromise({
      try: () => fs.readFile(tracePath, "utf8"),
      catch: (cause) => new SyscallDiagnosticFailed({ cause }),
    });
    const syscalls = yield* Effect.try({
      try: () => parseSyscallSummary(summary),
      catch: (cause) => new SyscallDiagnosticFailed({ cause }),
    });
    return {
      status: "observed" as const,
      boundary: "compiled process and descendant system calls" as const,
      scenarioId: scenario.id,
      tracePath,
      syscalls,
      metrics: result.metrics,
      limitation:
        "System calls establish physical I/O work. Semantic decode, render, validation, observation, and lock counts require capability-boundary evidence.",
    };
  });

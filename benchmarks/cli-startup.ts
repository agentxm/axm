import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

type Subject = "built-js" | "compiled-host";

type Sample = {
  readonly case: string;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly order: number;
  readonly sample: number;
  readonly subject: Subject;
};

const hostBinaryName = (): string => {
  if (process.platform === "linux" && process.arch === "x64") return "axm-linux-x64";
  if (process.platform === "linux" && process.arch === "arm64") return "axm-linux-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "axm-darwin-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "axm-darwin-arm64";
  if (process.platform === "win32" && process.arch === "x64") return "axm-windows-x64.exe";
  throw new Error(`No compiled host benchmark target for ${process.platform}/${process.arch}.`);
};

const percentile = (values: ReadonlyArray<number>, fraction: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  if (value === undefined) throw new Error("Cannot summarize an empty benchmark sample.");
  return value;
};

const snapshotTree = (root: string): ReadonlyArray<string> => {
  const entries: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(root, path).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        entries.push(`link:${name}:${readlinkSync(path)}`);
      } else if (entry.isDirectory()) {
        entries.push(`directory:${name}`);
        visit(path);
      } else {
        entries.push(`file:${name}:${readFileSync(path, "utf8")}`);
      }
    }
  };
  visit(root);
  return entries.sort();
};

export const runCliStartupBenchmark = (repoRoot: string, outputPath: string): void => {
  const built = resolve(repoRoot, "apps/cli/dist/src/main.js");
  const compiled = resolve(repoRoot, "apps/cli/dist/host-bin", hostBinaryName());
  for (const path of [built, compiled]) {
    if (!statSync(path).isFile()) throw new Error(`Missing CLI benchmark subject: ${path}.`);
  }
  const samples: Sample[] = [];
  const { FORCE_COLOR: _forceColor, ...parentEnvironment } = process.env;
  const cases = [
    { name: "version", args: ["--version"] },
    { name: "help", args: ["--help"] },
    {
      name: "setup",
      args: ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--json"],
    },
  ];
  for (const benchmarkCase of cases) {
    for (let sample = 1; sample <= 5; sample += 1) {
      const subjects: ReadonlyArray<Subject> =
        sample % 2 === 1 ? ["built-js", "compiled-host"] : ["compiled-host", "built-js"];
      const comparable: Array<{ readonly stdout: string; readonly tree: ReadonlyArray<string> }> =
        [];
      for (const [index, subject] of subjects.entries()) {
        const workspace = mkdtempSync(join(tmpdir(), "axm-cli-startup-workspace-"));
        const home = mkdtempSync(join(tmpdir(), "axm-cli-startup-home-"));
        try {
          const executable = subject === "built-js" ? process.execPath : compiled;
          const args =
            subject === "built-js" ? ["run", built, ...benchmarkCase.args] : benchmarkCase.args;
          const started = process.hrtime.bigint();
          const result = spawnSync(executable, args, {
            cwd: benchmarkCase.name === "setup" ? workspace : repoRoot,
            encoding: "utf8",
            env: {
              ...parentEnvironment,
              AXM_TELEMETRY: "0",
              AXM_USER_HOME: home,
              CI: "",
              HOME: home,
              NO_COLOR: "1",
            },
            timeout: 120_000,
          });
          const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
          if (result.error) throw result.error;
          const exitCode = result.status ?? 1;
          samples.push({
            case: benchmarkCase.name,
            durationMs,
            exitCode,
            order: index + 1,
            sample,
            subject,
          });
          if (exitCode !== 0)
            throw new Error(`${subject} ${benchmarkCase.name} failed: ${result.stderr}`);
          comparable.push({ stdout: result.stdout.trim(), tree: snapshotTree(workspace) });
        } finally {
          rmSync(workspace, { recursive: true, force: true });
          rmSync(home, { recursive: true, force: true });
        }
      }
      const first = comparable[0];
      const second = comparable[1];
      if (first === undefined || second === undefined)
        throw new Error("Incomplete benchmark pair.");
      if (
        first.stdout !== second.stdout ||
        JSON.stringify(first.tree) !== JSON.stringify(second.tree)
      )
        throw new Error(`${benchmarkCase.name} behavior differs between built and compiled CLIs.`);
    }
  }
  const summary = cases.flatMap((benchmarkCase) =>
    (["built-js", "compiled-host"] satisfies ReadonlyArray<Subject>).map((subject) => {
      const durations = samples
        .filter((entry) => entry.case === benchmarkCase.name && entry.subject === subject)
        .map((entry) => entry.durationMs);
      return {
        case: benchmarkCase.name,
        subject,
        medianMs: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
      };
    }),
  );
  const report = {
    schemaVersion: 1,
    platform: `${process.platform}/${process.arch}`,
    runtime: process.version,
    subjects: { built: relative(repoRoot, built), compiled: relative(repoRoot, compiled) },
    sampleMethod: "Five paired samples per case; execution order alternates by sample.",
    validation: "Exit status, stdout, and representative setup output tree were equivalent.",
    decision: "adopt-compiled-for-main-e2e",
    summary,
    samples,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`CLI startup benchmark: ${basename(outputPath)}`);
};

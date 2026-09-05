/**
 * Time-to-first-output diagnostic benchmark.
 *
 * Measures the wall-clock delay between spawning the built CLI and the first
 * byte written to either standard stream. This is trend evidence for the
 * latency budget stated in `docs/architecture/commands/terminal-design.md`;
 * it never contributes a behavioral pass.
 *
 * Run through the repository route: `pnpm bench` (the built CLI must exist:
 * `pnpm exec nx run cli:build`).
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { bench, describe } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const cliPath = path.join(repoRoot, "packages", "cli", "dist", "src", "main.js");

if (!fs.existsSync(cliPath)) {
  throw new Error(`Built CLI not found at ${cliPath}. Run \`pnpm exec nx run cli:build\` first.`);
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "axm-bench-"));
fs.writeFileSync(path.join(workspace, "axm.json"), `${JSON.stringify({ agents: [] }, null, 2)}\n`);

const { FORCE_COLOR: _forceColor, ...parentEnv } = process.env;

/** Milliseconds from spawn until the first byte on stdout or stderr. */
const timeToFirstOutput = (args: ReadonlyArray<string>): Promise<number> =>
  new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn("bun", ["run", cliPath, ...args], {
      cwd: workspace,
      env: { ...parentEnv, CI: "", NO_COLOR: "1", AXM_TELEMETRY: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    const settle = (result: number | Error): void => {
      if (settled) return;
      settled = true;
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
      child.kill();
    };
    const onFirstByte = (): void => settle(performance.now() - startedAt);
    child.stdout.once("data", onFirstByte);
    child.stderr.once("data", onFirstByte);
    child.once("error", (error) => settle(error));
    child.once("exit", () => settle(new Error(`axm ${args.join(" ")} exited without output`)));
  });

const options = { iterations: 10, warmupIterations: 2 } as const;

describe("time to first output", () => {
  bench("axm --version", async () => void (await timeToFirstOutput(["--version"])), options);
  bench("axm skills list", async () => void (await timeToFirstOutput(["skills", "list"])), options);
  bench(
    "axm skills list --json",
    async () => void (await timeToFirstOutput(["skills", "list", "--json"])),
    options,
  );
});

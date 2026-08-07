// @effect-diagnostics nodeBuiltinImport:off — subprocess smoke tests run the source entrypoint
import { spawn } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const CLI_PATH = path.resolve(import.meta.dirname, "main.ts");
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const combinedOutput = (result: CliResult): string => result.stdout + result.stderr;

const runAxm = (args: ReadonlyArray<string>): Promise<CliResult> =>
  new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", CLI_PATH, ...args], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, AXM_TELEMETRY: "0", CI: "1", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out running axm ${args.join(" ")}`));
    }, 30_000);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });

describe("axm source smoke", () => {
  // Spawns the real CLI via bun; cold starts run over vitest's 5s default
  // under CI load, so give the subprocess an explicit budget.
  it(
    "keeps AXM globals and omits suppressed Effect built-ins from root help",
    { timeout: 30_000 },
    async () => {
      const result = await runAxm(["--help"]);
      const output = combinedOutput(result);

      expect(result.exitCode).toBe(0);
      for (const flag of [
        "--help",
        "--version",
        "--non-interactive",
        "--verbose",
        "--debug",
        "--quiet",
        "--json",
      ]) {
        expect(output).toContain(flag);
      }
      expect(output).not.toContain("--completions");
      expect(output).not.toContain("--log-level");
      expect(output).not.toContain("--wizard");
      expect(output).not.toContain("-vv");
      expect(output).not.toContain("--version, -v");
    },
  );

  it("rejects the retired -vv debug spelling", { timeout: 30_000 }, async () => {
    const result = await runAxm(["-vv", "status", "--non-interactive"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unrecognized flag: -vv");
    expect(result.stderr).toContain("Use --debug");
  });
});

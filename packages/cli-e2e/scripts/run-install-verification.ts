import * as path from "node:path";
import { createInstallVerificationCommandPlan } from "../src/install-verification-runner.js";

const packageRoot = path.join(import.meta.dirname, "..");
const repoRoot = path.join(packageRoot, "..", "..");

const resolveCwd = (cwd: "packageRoot" | "repoRoot"): string =>
  cwd === "repoRoot" ? repoRoot : packageRoot;

const run = (cwd: string, command: string, args: ReadonlyArray<string>) => {
  console.log(`==> ${command} ${args.join(" ")}`);

  const result = Bun.spawnSync([command, ...args], {
    cwd,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.exitCode}`);
  }
};

const commandPlan = createInstallVerificationCommandPlan(process.env["AXM_INSTALL_BASE_URL"]);

if (commandPlan.length === 1) {
  console.log("Skipping local binary compile because AXM_INSTALL_BASE_URL is set.");
}

for (const step of commandPlan) {
  run(resolveCwd(step.cwd), step.command, step.args);
}

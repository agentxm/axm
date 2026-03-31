import { describe, expect, it } from "vitest";
import { createInstallVerificationCommandPlan } from "./install-verification-runner.js";

describe("install verification runner", () => {
  it("compiles a host-local binary when no install base url is configured", () => {
    expect(createInstallVerificationCommandPlan(undefined)).toEqual([
      {
        command: "pnpm",
        args: ["exec", "nx", "run", "cli:compile-host", "--outputStyle=static"],
        cwd: "repoRoot",
      },
      {
        command: "pnpm",
        args: ["exec", "vitest", "run", "--config", "vitest.install.config.ts"],
        cwd: "packageRoot",
      },
    ]);
  });

  it("treats an empty install base url as missing", () => {
    expect(createInstallVerificationCommandPlan("")).toEqual([
      {
        command: "pnpm",
        args: ["exec", "nx", "run", "cli:compile-host", "--outputStyle=static"],
        cwd: "repoRoot",
      },
      {
        command: "pnpm",
        args: ["exec", "vitest", "run", "--config", "vitest.install.config.ts"],
        cwd: "packageRoot",
      },
    ]);
  });

  it("skips local compile when install base url is configured", () => {
    expect(
      createInstallVerificationCommandPlan(
        "https://github.com/agentxm/axm/releases/latest/download",
      ),
    ).toEqual([
      {
        command: "pnpm",
        args: ["exec", "vitest", "run", "--config", "vitest.install.config.ts"],
        cwd: "packageRoot",
      },
    ]);
  });
});

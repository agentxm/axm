import { describe, expect, it } from "vitest";
import {
  createInstallVerificationCommandPlan,
  resolveCommandExecutable,
} from "./install-verification-runner.js";

describe("install verification runner", () => {
  it("compiles a host-local binary when no install base url is configured", () => {
    expect(createInstallVerificationCommandPlan(undefined)).toEqual([
      {
        command: "pnpm",
        args: ["nx", "run", "cli:compile-host"],
        cwd: "repoRoot",
      },
      {
        command: "pnpm",
        args: ["nx", "run", "cli-e2e:install-suite"],
        cwd: "repoRoot",
      },
    ]);
  });

  it("treats an empty install base url as missing", () => {
    expect(createInstallVerificationCommandPlan("")).toEqual([
      {
        command: "pnpm",
        args: ["nx", "run", "cli:compile-host"],
        cwd: "repoRoot",
      },
      {
        command: "pnpm",
        args: ["nx", "run", "cli-e2e:install-suite"],
        cwd: "repoRoot",
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
        args: ["nx", "run", "cli-e2e:install-suite"],
        cwd: "repoRoot",
      },
    ]);
  });

  it("uses pnpm.cmd on Windows", () => {
    expect(resolveCommandExecutable("pnpm", "win32")).toBe("pnpm.cmd");
  });

  it("uses pnpm directly on non-Windows platforms", () => {
    expect(resolveCommandExecutable("pnpm", "linux")).toBe("pnpm");
  });
});

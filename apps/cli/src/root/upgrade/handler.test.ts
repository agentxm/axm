import { Npm, Yarn } from "@agentxm/cli-maintenance/self-update/domain";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { TARGET_VERSION, runUpgradeCommand } from "../../test-support/upgrade-harness.js";

describe("upgrade human view", () => {
  it.effect("names the resolved method, delegated command, and verified binary by default", () =>
    Effect.gen(function* () {
      const run = yield* runUpgradeCommand({
        method: new Npm({ importUrl: "file:///npm/axm" }),
        human: true,
      });

      expect(run.humanOutput).toMatch(/Install\smethod\s+npm/u);
      expect(run.humanOutput).toMatch(/Ran\s+npm install -g axm\.sh@/u);
      expect(run.humanOutput).toMatch(/Verified\s{2,}/u);
      expect(run.humanOutput).toContain(TARGET_VERSION);
      // The audit trail stays behind --verbose.
      expect(run.humanOutput).not.toMatch(/Detection\s{2,}/u);
      expect(run.humanOutput).not.toContain("delegation: ");
    }),
  );

  it.effect("shows the failing command's output without requiring verbose", () =>
    Effect.gen(function* () {
      const run = yield* runUpgradeCommand({
        method: new Npm({ importUrl: "file:///npm/axm" }),
        human: true,
        respond: (invocation) =>
          invocation.executable === "npm" && invocation.args[0] === "install"
            ? {
                executionState: "exited",
                exitCode: 1,
                stdout: "",
                stderr: "npm ERR! code EACCES\nnpm ERR! permission denied",
              }
            : undefined,
      });

      expect(run.humanOutput).toContain("Output from npm install -g ");
      expect(run.humanOutput).toContain("npm ERR! permission denied");
      // A failed assessment exits through the one outcome-to-exit mapping.
      expect(run.exitCode).toBe(1);
    }),
  );

  it.effect("exits zero for a completed upgrade", () =>
    Effect.gen(function* () {
      const run = yield* runUpgradeCommand({
        method: new Npm({ importUrl: "file:///npm/axm" }),
        human: true,
      });
      expect(run.exitCode).toBe(0);
    }),
  );

  it.effect("shows plumbing only in verbose mode and gives quiet precedence", () =>
    Effect.gen(function* () {
      const verbose = yield* runUpgradeCommand({
        method: new Npm({ importUrl: "file:///npm/axm" }),
        human: true,
        verbose: true,
      });
      expect(verbose.humanOutput).toMatch(/Detection\s{2,}/u);
      expect(verbose.humanOutput).toMatch(/Delegation command\s+npm /u);
      expect(verbose.humanOutput).toContain("Verification ");

      const quiet = yield* runUpgradeCommand({
        method: new Yarn({
          importUrl: "file:///yarn/axm",
          managerMajorVersion: 4,
        }),
        human: true,
        quiet: true,
        verbose: true,
      });
      expect(quiet.humanOutput).toMatch(/^Next$/mu);
      expect(quiet.humanOutput).not.toMatch(/Install\smethod\s{2,}/u);
    }),
  );
});

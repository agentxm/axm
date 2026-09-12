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

      expect(run.humanOutput).toContain("Install method: npm");
      expect(run.humanOutput).toContain("Ran: npm install -g axm.sh@");
      expect(run.humanOutput).toContain("Verified: ");
      expect(run.humanOutput).toContain(TARGET_VERSION);
      // The audit trail stays behind --verbose.
      expect(run.humanOutput).not.toContain("Detection: ");
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
    }),
  );

  it.effect("shows plumbing only in verbose mode and gives quiet precedence", () =>
    Effect.gen(function* () {
      const verbose = yield* runUpgradeCommand({
        method: new Npm({ importUrl: "file:///npm/axm" }),
        human: true,
        verbose: true,
      });
      expect(verbose.humanOutput).toContain("Detection: ");
      expect(verbose.humanOutput).toContain("delegation: npm ");
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
      expect(quiet.humanOutput).toContain("Next:");
      expect(quiet.humanOutput).not.toContain("Install method: ");
    }),
  );
});

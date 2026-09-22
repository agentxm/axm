import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Npm } from "@agentxm/cli-maintenance/self-update/domain";
import { defineSpecification } from "@agentxm/specification-metadata";

import { runUpgradeCommand, TARGET_VERSION } from "../test-support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/results-stand-alone-on-stdout",
  title: "A captured result remains useful without the interactive transcript",
  statement:
    "When AXM produces a primary human result, stdout shall contain that result's selected facts, findings, disposition and recovery without depending on activity or diagnostic context on stderr, including previews and unsuccessful assessments.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  methods: ["example"],
  derivedFrom: ["cli/non-success-results-name-a-fitting-recovery"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Primary results on stdout", () => {
  it.effect("captures an upgrade's owner, delegated command and verified version", () =>
    Effect.gen(function* () {
      const run = yield* runUpgradeCommand({
        method: new Npm({ importUrl: "file:///npm/axm" }),
        human: true,
      });
      expect(run.stdout).toContain("Install method: npm");
      expect(run.stdout).toContain("Ran: npm install -g axm.sh@");
      expect(run.stdout).toContain("Verified:");
      expect(run.stdout).toContain(TARGET_VERSION);
    }),
  );

  it.effect("captures a preview even though no mutation completed", () =>
    Effect.gen(function* () {
      const run = yield* runUpgradeCommand({ human: true, preview: true });
      expect(run.stdout).toContain(TARGET_VERSION);
      expect(run.stdout).toContain("Install method: Homebrew");
      expect(run.installMetaWrites).toHaveLength(0);
    }),
  );

  it.effect.each([false, true])("captures failure evidence with quiet=%s", (quiet) =>
    Effect.gen(function* () {
      const run = yield* runUpgradeCommand({
        method: new Npm({ importUrl: "file:///npm/axm" }),
        human: true,
        quiet,
        respond: (invocation) =>
          invocation.executable === "npm" && invocation.args[0] === "install"
            ? {
                executionState: "exited",
                exitCode: 1,
                stdout: "",
                stderr: "npm ERR! permission denied",
              }
            : undefined,
      });
      expect(run.stdout).toContain("npm ERR! permission denied");
      expect(run.stdout).toContain("npm install -g");
    }),
  );
});

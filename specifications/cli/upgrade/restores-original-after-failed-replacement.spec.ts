import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import { afterEach } from "vitest";
import { Script } from "axm.sh/specification-harness";
import {
  makeUpgradeExecution,
  completedUpgradeCommand,
  upgradeBinary,
} from "../../support/upgrade-execution-fixture.js";
import { LOCAL_VERSION } from "../../support/upgrade-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/restores-original-after-failed-replacement",
  title: "Script upgrade restores the original after replacement fails verification",
  statement:
    "When a script-owned executable has been replaced but cannot be verified as the selected version, or the operation is interrupted before completion, AXM shall restore the original executable and shall not report a successful upgrade.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/upgrade/handler.internal.test.ts"],
  supersedes: [],
  assumptions: [
    "Filesystem restoration remains available; operating-system or storage failures that also prevent rollback require separate recovery evidence.",
  ],
  openQuestions: [],
});

describe("Interrupted or unverified script replacement", () => {
  const directories: Array<string> = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      fs.rmSync(directory, { recursive: true, force: true });
  });
  const installation = () => {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-spec-")));
    directories.push(directory);
    const executable = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
    fs.writeFileSync(executable, "Previously working AXM executable.\n", { mode: 0o755 });
    return { directory, executable, method: new Script({ execPath: executable }) };
  };
  it.effect("restores the original bytes and reports failed verification", () =>
    Effect.gen(function* () {
      const installed = installation();
      const before = snapshotWorkspaceContent(installed.directory);
      let installedChecks = 0;
      const upgrade = makeUpgradeExecution({
        method: installed.method,
        reply: (invocation) => {
          if (invocation.executable !== installed.executable) return undefined;
          installedChecks += 1;
          return installedChecks === 1
            ? Effect.succeed(completedUpgradeCommand("77.0.0\n"))
            : undefined;
        },
      });
      yield* upgrade.run();
      expect(snapshotWorkspaceContent(installed.directory)).toEqual(before);
      expect(upgrade.document().result).toMatchObject({
        outcome: "failed",
        disposition: "rolled-back",
        mutation: { state: "rolled-back" },
        verification: { state: "mismatch", reportedVersion: LOCAL_VERSION },
      });
      expect(upgrade.document().result.recovery.recommendedCommand).not.toBeNull();
      expect(upgrade.metadata).toEqual([]);
      expect(installedChecks).toBe(2);
    }),
  );
  it.effect(
    "restores the original bytes when interrupted during installed-version verification",
    () =>
      Effect.gen(function* () {
        const installed = installation();
        const before = snapshotWorkspaceContent(installed.directory);
        const verificationStarted = yield* Deferred.make<void>();
        const upgrade = makeUpgradeExecution({
          method: installed.method,
          reply: (invocation) =>
            invocation.executable === installed.executable
              ? Effect.gen(function* () {
                  yield* Deferred.succeed(verificationStarted, undefined);
                  return yield* Effect.never;
                })
              : undefined,
        });
        const fiber = yield* upgrade.run().pipe(Effect.forkChild);
        yield* Deferred.await(verificationStarted);
        expect(fs.readFileSync(installed.executable)).toEqual(Buffer.from(upgradeBinary));
        yield* Fiber.interrupt(fiber);
        expect(snapshotWorkspaceContent(installed.directory)).toEqual(before);
        expect(upgrade.metadata).toEqual([]);
      }),
  );
});

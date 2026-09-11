import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import { afterEach } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { Script } from "../install-method/install-method.js";
import {
  LOCAL_VERSION,
  commandExited,
  makeUpgradeTrial,
  snapshotDirectory,
  upgradeBinary,
  type SubprocessInvocation,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/restores-original-after-failed-replacement",
  title: "Script upgrade restores the original after replacement fails verification",
  statement:
    "When a script-owned executable has been replaced but cannot be verified as the selected version, or the operation is interrupted before completion, AXM shall restore the original executable and shall not report a successful upgrade.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Filesystem restoration remains available; operating-system or storage failures that also prevent rollback require separate recovery evidence.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Restoration after an externally terminated replacement is witnessed in process, through the finalizer the interrupt runs, rather than at the process boundary: the release channel and asset URLs are compiled constants with no environment override, so no installed-boundary run can serve a release fixture to the built executable.",
      retirementCondition:
        "The self-update capability accepts a release-origin override that a controlled run may point at a local fixture, and an installed-boundary example signals the running upgrade and observes the restored executable and exit status.",
    },
  ],
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
      const before = snapshotDirectory(installed.directory);
      let installedChecks = 0;
      const upgrade = yield* makeUpgradeTrial({
        method: installed.method,
        respond: (invocation: SubprocessInvocation) => {
          if (invocation.executable !== installed.executable) return undefined;
          installedChecks += 1;
          return installedChecks === 1 ? commandExited("77.0.0\n") : undefined;
        },
      });
      const assessment = yield* upgrade.run();
      expect(snapshotDirectory(installed.directory)).toEqual(before);
      expect(assessment).toMatchObject({
        outcome: "failed",
        disposition: "rolled-back",
        mutation: { state: "rolled-back" },
        verification: { state: "mismatch", reportedVersion: LOCAL_VERSION },
      });
      expect(assessment.recovery.recommendedCommand).not.toBeNull();
      expect(upgrade.installMetaWrites).toEqual([]);
      expect(installedChecks).toBe(2);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  // The restore runs from the replacement's own finalizer, so a termination
  // that reaches the running fiber — which is how a delivered signal reaches
  // it — puts the original bytes back before anything else observes the
  // directory.
  it.effect("restores the original bytes when the replacement is terminated mid-verification", () =>
    Effect.gen(function* () {
      const installed = installation();
      const before = snapshotDirectory(installed.directory);
      const verificationStarted = yield* Deferred.make<void>();
      const upgrade = yield* makeUpgradeTrial({
        method: installed.method,
        respond: (invocation: SubprocessInvocation) =>
          invocation.executable === installed.executable ? commandExited("held\n") : undefined,
        beforeReply: (invocation: SubprocessInvocation) =>
          invocation.executable === installed.executable
            ? Effect.gen(function* () {
                yield* Deferred.succeed(verificationStarted, undefined);
                return yield* Effect.never;
              })
            : Effect.void,
      });
      const fiber = yield* upgrade.run().pipe(Effect.forkChild);
      yield* Deferred.await(verificationStarted);
      expect(fs.readFileSync(installed.executable)).toEqual(Buffer.from(upgradeBinary));
      yield* Fiber.interrupt(fiber);
      expect(snapshotDirectory(installed.directory)).toEqual(before);
      expect(upgrade.installMetaWrites).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

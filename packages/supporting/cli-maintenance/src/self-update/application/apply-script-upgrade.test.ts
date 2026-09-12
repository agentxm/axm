import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { Script } from "../domain/index.js";
import { applyScriptUpgrade } from "./apply-script-upgrade.js";
import { UpgradeFailed } from "./errors.js";
import { InstallationRecorder } from "./package-installer.js";
import {
  ScriptExecutableInstaller,
  ScriptReleaseAssets,
  type StagedExecutable,
} from "./script-installer.js";
import { UpgradeWorkingDirectory } from "./working-directory.js";

interface TrialOptions {
  readonly busy?: boolean;
  readonly checksumMismatch?: boolean;
  readonly preparedVersion?: string;
  readonly installedVersion?: string;
  readonly restoredVersion?: string;
  readonly protect?: boolean;
  readonly replace?: boolean;
  readonly restore?: boolean;
  readonly metadataFailure?: boolean;
}

/** The same operation runs over substitute ports without filesystem, HTTP, process or terminal services. */
const makeTrial = (options: TrialOptions = {}) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<string>>([]);
    const inspected = yield* Ref.make(0);
    const call = (name: string) => Ref.update(calls, (current) => [...current, name]);
    const staged: StagedExecutable = {
      path: "/staged/axm",
      backupPath: "/recovery/axm",
      protectOriginal: call("protect").pipe(Effect.as(options.protect ?? true)),
      replace: call("replace").pipe(Effect.as(options.replace ?? true)),
      restore: call("restore").pipe(Effect.as(options.restore ?? true)),
      accept: call("accept"),
    };
    const layer = Layer.mergeAll(
      Layer.succeed(UpgradeWorkingDirectory, { path: "/chosen-directory" }),
      Layer.succeed(ScriptReleaseAssets, {
        read: () =>
          call("download").pipe(
            Effect.as({
              bytes: new Uint8Array([1, 2, 3]),
              sha256Hex: (options.checksumMismatch ? "b" : "a").repeat(64),
              checksumManifest: `${"a".repeat(64)}  axm-linux-x64\n`,
            }),
          ),
      }),
      Layer.succeed(ScriptExecutableInstaller, {
        acquire: () =>
          Effect.gen(function* () {
            yield* call("acquire");
            if (options.busy) return null;
            return yield* Effect.acquireRelease(
              Effect.succeed({
                targetPath: "/installed/axm",
                stage: () => call("stage").pipe(Effect.as(staged)),
              }),
              () => call("release"),
            );
          }),
        inspect: (path, purpose, directory) =>
          Effect.gen(function* () {
            expect(directory).toBe("/chosen-directory");
            yield* call(`${purpose}:${path}`);
            const index = yield* Ref.getAndUpdate(inspected, (value) => value + 1);
            const version =
              index === 0
                ? (options.preparedVersion ?? "2.0.0")
                : index === 1
                  ? (options.installedVersion ?? "2.0.0")
                  : (options.restoredVersion ?? "1.0.0");
            return {
              reportedVersion: version,
              command: {
                purpose,
                executable: path,
                args: ["--version"],
                display: `${path} --version`,
                executionState: "exited",
                exitCode: 0,
                stdout: version,
                stderr: "",
                outputTruncated: false,
              },
            };
          }),
      }),
      Layer.succeed(InstallationRecorder, {
        record: (_method, path) =>
          Effect.gen(function* () {
            expect(path).toBe("/installed/axm");
            yield* call("record");
            if (options.metadataFailure)
              return yield* new UpgradeFailed({
                category: "internal",
                detail: "fixture metadata failure",
              });
          }),
      }),
    );
    const run = applyScriptUpgrade({
      method: new Script({ execPath: "/invoked/axm" }),
      binaryName: "axm-linux-x64",
      release: {
        binaryAssetUrl: "https://example.invalid/binary",
        checksumAssetUrl: "https://example.invalid/checksums",
      },
      recoveryCommand: { executable: "alternate-installer", args: ["2.0.0"], shellRequired: false },
      detectionCommands: [],
      relation: "upgrade-available",
      localVersion: "1.0.0",
      targetVersion: "2.0.0",
      reinstall: false,
    }).pipe(Effect.provide(layer));
    return { run, calls };
  });

describe("script upgrade application", () => {
  it.effect("does not download or mutate when another operation owns the installation", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ busy: true });
      expect((yield* trial.run).resultStatus).toBe("manual-action-required");
      expect(yield* Ref.get(trial.calls)).toEqual(["acquire"]);
    }),
  );

  it.effect("rejects a checksum mismatch before staging and releases the operation", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ checksumMismatch: true });
      expect((yield* Effect.flip(trial.run)).category).toBe("validation");
      expect(yield* Ref.get(trial.calls)).toEqual(["acquire", "download", "release"]);
    }),
  );

  it.effect("rejects the wrong staged version before protecting or replacing the original", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ preparedVersion: "3.0.0" });
      expect((yield* Effect.flip(trial.run)).category).toBe("validation");
      expect(yield* Ref.get(trial.calls)).toEqual([
        "acquire",
        "download",
        "stage",
        "verification:/staged/axm",
        "release",
      ]);
    }),
  );

  it.effect("requires a restorable original before replacement", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ protect: false });
      const result = yield* trial.run;
      expect(result.mutationState).toBe("not-attempted");
      expect(result.executedCommands).toHaveLength(1);
      expect(yield* Ref.get(trial.calls)).not.toContain("replace");
    }),
  );

  it.effect("restores an unsuccessful replacement without recording an installation", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ replace: false });
      expect((yield* trial.run).resultStatus).toBe("rolled-back");
      expect(yield* Ref.get(trial.calls)).toEqual([
        "acquire",
        "download",
        "stage",
        "verification:/staged/axm",
        "protect",
        "replace",
        "restore",
        "release",
      ]);
    }),
  );

  it.effect("verifies restoration when the installed version is wrong", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ installedVersion: "3.0.0" });
      const result = yield* trial.run;
      expect(result).toMatchObject({
        resultStatus: "rolled-back",
        reportedVersion: "1.0.0",
        verification: "mismatch",
      });
      expect(result.executedCommands.map((command) => command.purpose)).toEqual([
        "verification",
        "verification",
        "rollback",
      ]);
      expect(yield* Ref.get(trial.calls)).not.toContain("record");
    }),
  );

  it.effect(
    "preserves a verified update and recovery artifact when metadata cannot be recorded",
    () =>
      Effect.gen(function* () {
        const trial = yield* makeTrial({ metadataFailure: true });
        expect(yield* trial.run).toMatchObject({
          resultStatus: "upgrade-incomplete",
          mutationState: "updated",
          verification: "verified",
          backupPath: "/recovery/axm",
        });
        const calls = yield* Ref.get(trial.calls);
        expect(calls).toContain("record");
        expect(calls).not.toContain("accept");
        expect(calls).not.toContain("restore");
        expect(calls.at(-1)).toBe("release");
      }),
  );

  it.effect("identifies the retained backup when restoration fails", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ installedVersion: "3.0.0", restore: false });
      expect((yield* Effect.flip(trial.run)).detail).toContain("recoverable backup: /recovery/axm");
      expect(yield* Ref.get(trial.calls)).not.toContain("record");
    }),
  );

  it.effect("identifies the restored executable when its version cannot be verified", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial({ installedVersion: "3.0.0", restoredVersion: "4.0.0" });
      const failure = yield* Effect.flip(trial.run);
      expect(failure.detail).toBe(
        "The restored AXM executable could not be verified at /installed/axm",
      );
      expect(yield* Ref.get(trial.calls)).not.toContain("record");
    }),
  );

  it.effect("accepts the verified replacement only after recording it", () =>
    Effect.gen(function* () {
      const trial = yield* makeTrial();
      expect(yield* trial.run).toMatchObject({
        resultStatus: "upgraded",
        mutationState: "updated",
        verification: "verified",
        backupPath: null,
      });
      expect((yield* Ref.get(trial.calls)).slice(-3)).toEqual(["record", "accept", "release"]);
    }),
  );
});

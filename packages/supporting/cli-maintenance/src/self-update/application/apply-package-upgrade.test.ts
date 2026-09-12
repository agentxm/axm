import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { Homebrew, Npm } from "../domain/index.js";
import { applyPackageUpgrade } from "./apply-package-upgrade.js";
import type { CommandRecord } from "./evidence.js";
import type { InstallerAvailability } from "./execution-result.js";
import {
  InstallationRecorder,
  PackageInstaller,
  type PackageInstallationObservation,
  type PackageManagedInstallation,
} from "./package-installer.js";
import { UpgradeWorkingDirectory } from "./working-directory.js";

const localVersion = "1.0.0";
const targetVersion = "2.0.0";
const ready: InstallerAvailability = {
  state: "ready",
  observedVersion: targetVersion,
  details: [],
};

const installation = (
  managerVersion: string | null,
  pathVersion = managerVersion,
): PackageInstallationObservation => ({
  managerPath: "/installation/axm",
  managerVersion,
  pathVersion,
  commands: [],
  executables: [
    {
      role: "manager-owned",
      path: "/installation/axm",
      reportedVersion: managerVersion,
      exitCode: 0,
    },
    { role: "path-resolved", path: "/bin/axm", reportedVersion: pathVersion, exitCode: 0 },
  ],
});

/** An alternate installer supplies facts through the same application contract, without host or terminal services. */
const runApplication = (
  method: PackageManagedInstallation,
  observations: ReadonlyArray<PackageInstallationObservation>,
  availability: InstallerAvailability = ready,
) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<string>>([]);
    const inspectionIndex = yield* Ref.make(0);
    const recordCall = (call: string, directory: string) =>
      Effect.gen(function* () {
        expect(directory).toBe("/chosen-directory");
        yield* Ref.update(calls, (current) => [...current, call]);
      });
    const layer = Layer.mergeAll(
      Layer.succeed(UpgradeWorkingDirectory, { path: "/chosen-directory" }),
      Layer.succeed(PackageInstaller, {
        availability: (_method, _version, directory) =>
          recordCall("availability", directory).pipe(Effect.as({ availability, commands: [] })),
        prepareHomebrew: (_version, directory) =>
          recordCall("prepare-homebrew", directory).pipe(Effect.as({ availability, commands: [] })),
        inspect: (_method, phase, directory) =>
          Effect.gen(function* () {
            yield* recordCall(`inspect:${phase}`, directory);
            const index = yield* Ref.getAndUpdate(inspectionIndex, (value) => value + 1);
            const observed = observations[index];
            if (observed === undefined)
              return yield* Effect.die("Unexpected extra installation inspection");
            return observed;
          }),
        mutate: (_method, version, reinstall, directory) =>
          Effect.gen(function* () {
            expect(version).toBe(targetVersion);
            yield* recordCall(`mutate:${String(reinstall)}`, directory);
            const result: CommandRecord = {
              purpose: "delegation",
              executable: "alternate-installer",
              args: [version],
              display: `alternate-installer ${version}`,
              executionState: "exited",
              exitCode: 0,
              stdout: "",
              stderr: "",
              outputTruncated: false,
            };
            return {
              command: { executable: result.executable, args: result.args, shellRequired: false },
              result,
            };
          }),
      }),
      Layer.succeed(InstallationRecorder, {
        record: (_method, path) =>
          Effect.gen(function* () {
            expect(path).toBe("/installation/axm");
            yield* Ref.update(calls, (current) => [...current, "record"]);
          }),
      }),
    );
    const result = yield* applyPackageUpgrade({
      method,
      detectionCommands: [],
      relation: "upgrade-available",
      localVersion,
      targetVersion,
      reinstall: false,
    }).pipe(Effect.provide(layer));
    return { result, calls: yield* Ref.get(calls) };
  });

describe("package upgrade application without delivery or native adapters", () => {
  const npm = new Npm({
    importUrl: "file:///installation/axm",
    managerOwnedExecutable: "/installation/axm",
  });
  const homebrew = new Homebrew({ execPath: "/installation/axm" });

  it.effect("owns the availability gate for an alternate delivery caller", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* runApplication(npm, [], {
        state: "unavailable",
        observedVersion: null,
        details: ["The selected version has not been published."],
      });
      expect(calls).toEqual(["availability"]);
      expect(result).toMatchObject({
        resultStatus: "manual-action-required",
        mutationState: "not-attempted",
      });
    }),
  );

  it.effect("requires observed installation agreement after a successful delegate exit", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* runApplication(npm, [
        installation(targetVersion, localVersion),
      ]);
      expect(calls).toEqual(["availability", "mutate:false", "inspect:post-primary"]);
      expect(result).toMatchObject({
        resultStatus: "upgrade-incomplete",
        verification: "mismatch",
      });
    }),
  );

  it.effect("records a verified installation through the owner-defined persistence port", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* runApplication(npm, [installation(targetVersion)]);
      expect(calls).toEqual(["availability", "mutate:false", "inspect:post-primary", "record"]);
      expect(result).toMatchObject({ resultStatus: "upgraded", verification: "verified" });
    }),
  );

  for (const finalVersion of [targetVersion, localVersion]) {
    it.effect(
      `bounds Homebrew reinstall recovery when the final observed version is ${finalVersion}`,
      () =>
        Effect.gen(function* () {
          const { result, calls } = yield* runApplication(homebrew, [
            installation(localVersion),
            installation(localVersion),
            installation(finalVersion),
          ]);
          expect(calls).toEqual([
            "prepare-homebrew",
            "inspect:pre-mutation",
            "mutate:false",
            "inspect:post-primary",
            "mutate:true",
            "inspect:post-fallback",
            ...(finalVersion === targetVersion ? ["record"] : []),
          ]);
          expect(result.resultStatus).toBe(
            finalVersion === targetVersion ? "upgraded" : "upgrade-incomplete",
          );
        }),
    );
  }

  it.effect("does not reinstall a changed Homebrew entry to conceal PATH disagreement", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* runApplication(homebrew, [
        installation(localVersion),
        installation(targetVersion, localVersion),
      ]);
      expect(calls).toEqual([
        "prepare-homebrew",
        "inspect:pre-mutation",
        "mutate:false",
        "inspect:post-primary",
      ]);
      expect(result).toMatchObject({
        resultStatus: "upgrade-incomplete",
        homebrewFailure: "manager-path-disagreement",
      });
    }),
  );
});

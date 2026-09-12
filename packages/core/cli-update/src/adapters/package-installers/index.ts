import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import type * as Path from "effect/Path";
import * as semver from "semver";
import { observeChildUnit } from "@agentxm/workspace-operations";
import { methodName } from "@agentxm/cli-maintenance/self-update/domain";
import { formatRecommendedCommand } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import {
  UpgradeFailed,
  type CommandRecord,
  type InstallationInspectionPhase,
  type InstallationRecorder,
  type PackageInstallerService,
  type VerificationExecutable,
} from "@agentxm/cli-maintenance/self-update/application";
import type { InstallMetaService } from "../../install-meta/install-meta.js";
import type { RunCommandOptions, SubprocessService } from "../../subprocess/subprocess.js";
import { readHomebrewFormula, readPackageAvailability } from "./availability.js";
import {
  HOMEBREW_ENV,
  HOMEBREW_FORMULA,
  HOMEBREW_TAP,
  NPM_PACKAGE,
  packageAvailabilityCommand,
  packageManagerCommand,
} from "./commands.js";

/** One invocation owns the counter; execution returns evidence rather than mutating a caller's array. */
export const makePackageInstaller = (
  subprocess: SubprocessService,
  pathService: Path.Path,
  counter: Ref.Ref<number>,
): PackageInstallerService => {
  const run = (
    purpose: CommandRecord["purpose"],
    executable: string,
    args: ReadonlyArray<string>,
    workingDirectory: string,
    options?: RunCommandOptions,
  ) =>
    Effect.gen(function* () {
      const sequence = yield* Ref.getAndUpdate(counter, (value) => value + 1);
      const display = formatRecommendedCommand({ executable, args, shellRequired: false });
      return yield* observeChildUnit(
        {
          id: `package-command-${String(sequence)}`,
          label: display,
          resolvedLabel: (record: CommandRecord) => {
            const outcome =
              record.executionState === "not-started"
                ? "did not start"
                : record.executionState === "timed-out"
                  ? "timed out"
                  : record.exitCode === 0
                    ? null
                    : `exit ${record.exitCode === null ? "unavailable" : String(record.exitCode)}`;
            return outcome === null ? display : `${display} · ${outcome}`;
          },
        },
        Effect.map(
          subprocess.run(executable, args, { ...options, cwd: workingDirectory }),
          (result): CommandRecord => ({
            purpose,
            executable,
            args,
            display,
            executionState: result.executionState,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            outputTruncated: result.stdoutTruncated === true || result.stderrTruncated === true,
          }),
        ),
      );
    });

  const reportedVersion = (result: CommandRecord): string | null =>
    result.exitCode === 0 ? semver.valid(result.stdout.trim()) : null;

  const inspectExecutable = (
    role: "manager-owned" | "path-resolved",
    phase: InstallationInspectionPhase,
    requestedExecutable: string,
    resolvedExecutable: string | null,
    workingDirectory: string,
  ) =>
    Effect.gen(function* () {
      if (resolvedExecutable === null) {
        return {
          executable: {
            role,
            phase,
            path: requestedExecutable,
            requestedExecutable,
            resolvedExecutable: null,
            queryOutcome: "unavailable",
            reportedVersion: null,
            exitCode: null,
          } satisfies VerificationExecutable,
          commands: [],
        };
      }
      const result = yield* run(
        "verification",
        resolvedExecutable,
        ["--version"],
        workingDirectory,
        { timeoutMs: 10_000 },
      );
      const version = reportedVersion(result);
      return {
        executable: {
          role,
          phase,
          path: resolvedExecutable,
          requestedExecutable,
          resolvedExecutable,
          queryOutcome:
            result.executionState !== "exited" || result.exitCode !== 0
              ? "unavailable"
              : version === null
                ? "invalid"
                : "reported",
          reportedVersion: version,
          exitCode: result.exitCode,
        } satisfies VerificationExecutable,
        commands: [result],
      };
    });

  return {
    availability: (method, targetVersion, workingDirectory) =>
      Effect.gen(function* () {
        const command = packageAvailabilityCommand(method, targetVersion);
        const response = yield* run(
          "detection",
          command.executable,
          command.args,
          workingDirectory,
          { timeoutMs: 10_000 },
        );
        return {
          availability: readPackageAvailability(method, targetVersion, response),
          commands: [response],
        };
      }),
    prepareHomebrew: (targetVersion, workingDirectory) =>
      Effect.gen(function* () {
        const tapList = yield* run("detection", "brew", ["tap"], workingDirectory, {
          env: HOMEBREW_ENV,
        });
        if (tapList.executionState !== "exited" || tapList.exitCode !== 0) {
          return {
            availability: { state: "indeterminate", observedVersion: null, details: [] },
            failure: "tap-query-failed",
            commands: [tapList],
          };
        }
        const taps = tapList.stdout.split(/\r?\n/u).map((line) => line.trim());
        const tap = taps.includes(HOMEBREW_TAP)
          ? null
          : yield* run("preparation", "brew", ["tap", HOMEBREW_TAP], workingDirectory, {
              env: HOMEBREW_ENV,
            });
        const preparationCommands = tap === null ? [tapList] : [tapList, tap];
        if (tap !== null && (tap.executionState !== "exited" || tap.exitCode !== 0)) {
          return {
            availability: { state: "indeterminate", observedVersion: null, details: [] },
            failure: "tap-preparation-failed",
            commands: preparationCommands,
          };
        }
        const refresh = yield* run("preparation", "brew", ["update"], workingDirectory, {
          env: HOMEBREW_ENV,
        });
        const refreshedCommands = [...preparationCommands, refresh];
        if (refresh.executionState !== "exited" || refresh.exitCode !== 0) {
          return {
            availability: {
              state: "indeterminate",
              observedVersion: null,
              details: [
                "Homebrew metadata refresh did not complete, so AXM did not attempt a package mutation.",
                "Resolve the recorded brew update failure, then rerun axm upgrade.",
              ],
            },
            failure: "refresh-failed",
            commands: refreshedCommands,
          };
        }
        const query = yield* run(
          "detection",
          "brew",
          ["info", "--json=v2", HOMEBREW_FORMULA],
          workingDirectory,
          { env: HOMEBREW_ENV },
        );
        const { failure, ...availability } = readHomebrewFormula(query, targetVersion);
        return {
          availability,
          ...(failure === undefined ? {} : { failure }),
          commands: [...refreshedCommands, query],
        };
      }),
    inspect: (method, phase, workingDirectory) =>
      Effect.gen(function* () {
        if (method._tag === "Homebrew") {
          const prefix = yield* run("detection", "brew", ["--prefix"], workingDirectory, {
            env: HOMEBREW_ENV,
            timeoutMs: 10_000,
          });
          const prefixValue =
            prefix.executionState === "exited" &&
            prefix.exitCode === 0 &&
            prefix.stdout.trim().length > 0
              ? prefix.stdout.trim()
              : null;
          const executable = process.platform === "win32" ? "axm.exe" : "axm";
          const managerPath =
            prefixValue === null ? null : pathService.join(prefixValue, "bin", executable);
          const pathResolved = yield* subprocess.resolveExecutable(executable);
          const manager = yield* inspectExecutable(
            "manager-owned",
            phase,
            "homebrew:bin/axm",
            managerPath,
            workingDirectory,
          );
          const path = yield* inspectExecutable(
            "path-resolved",
            phase,
            executable,
            pathResolved,
            workingDirectory,
          );
          return {
            managerPath,
            managerVersion: manager.executable.reportedVersion,
            pathVersion: path.executable.reportedVersion,
            executables: [manager.executable, path.executable],
            commands: [prefix, ...manager.commands, ...path.commands],
          };
        }
        const managerPath = method.managerOwnedExecutable;
        const requested: ReadonlyArray<{
          readonly role: "manager-owned" | "path-resolved";
          readonly path: string;
        }> = [
          ...(managerPath === undefined
            ? []
            : [{ role: "manager-owned" as const, path: managerPath }]),
          ...(managerPath === "axm" ? [] : [{ role: "path-resolved" as const, path: "axm" }]),
        ];
        const observations = yield* Effect.forEach(requested, (entry) =>
          Effect.gen(function* () {
            const result = yield* run("verification", entry.path, ["--version"], workingDirectory, {
              timeoutMs: 10_000,
            });
            return {
              executable: {
                ...entry,
                reportedVersion: reportedVersion(result),
                exitCode: result.exitCode,
              } satisfies VerificationExecutable,
              command: result,
            };
          }),
        );
        return {
          managerPath: managerPath ?? null,
          managerVersion:
            observations.find((entry) => entry.executable.role === "manager-owned")?.executable
              .reportedVersion ?? null,
          pathVersion:
            observations.find((entry) => entry.executable.role === "path-resolved")?.executable
              .reportedVersion ?? null,
          executables: observations.map((entry) => entry.executable),
          commands: observations.map((entry) => entry.command),
        };
      }),
    mutate: (method, targetVersion, reinstall, workingDirectory) =>
      Effect.gen(function* () {
        const command = packageManagerCommand(method, targetVersion, reinstall);
        if (command === null) {
          return yield* new UpgradeFailed({
            category: "validation",
            detail: "The selected package manager cannot install AXM.",
          });
        }
        const result = yield* run(
          "delegation",
          command.executable,
          command.args,
          workingDirectory,
          method._tag === "Homebrew" ? { env: HOMEBREW_ENV } : undefined,
        );
        return { command, result };
      }),
  };
};

export const makeInstallationRecorder = (
  installMeta: InstallMetaService,
): typeof InstallationRecorder.Service => ({
  record: (method, executablePath) =>
    Effect.gen(function* () {
      const name = methodName(method);
      if (name === "unknown") return;
      yield* installMeta.write({
        schemaVersion: 2,
        method: name,
        installedAt: yield* DateTime.now,
        packageName: name === "npm" || name === "pnpm" || name === "yarn" ? NPM_PACKAGE : undefined,
        managerMajorVersion: method._tag === "Yarn" ? method.managerMajorVersion : undefined,
        executablePath: executablePath ?? undefined,
      });
    }),
});

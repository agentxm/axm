import * as Effect from "effect/Effect";
import {
  methodExecutablePath,
  shouldReinstallHomebrew,
  verifyHomebrewInstallation,
  verifyPackageInstallation,
} from "../domain/index.js";
import { upgradeBaseFacts, noMutationResult, type BaseResultInput } from "./execution-facts.js";
import type { HomebrewFailure, UpgradeCoreResult } from "./execution-result.js";
import {
  InstallationRecorder,
  PackageInstaller,
  type PackageInstallationObservation,
  type PackageManagedInstallation,
} from "./package-installer.js";
import { UpgradeExecutionObserver } from "./execution-observer.js";
import { UpgradeWorkingDirectory } from "./working-directory.js";

export interface PackageUpgradeInput extends BaseResultInput {
  readonly method: PackageManagedInstallation;
}

const homebrewVerificationFailure = (
  verification: PackageInstallationObservation,
  baselineVersion: string | null,
  targetVersion: string,
  fallbackAttempted: boolean,
): { readonly failure: HomebrewFailure; readonly details: ReadonlyArray<string> } => {
  if (verification.managerVersion === null) {
    return {
      failure: "manager-version-mismatch",
      details: ["Homebrew's stable AXM entrypoint did not report a valid version."],
    };
  }
  if (
    verification.managerVersion === baselineVersion &&
    verification.managerVersion !== targetVersion
  ) {
    return {
      failure: "manager-version-unchanged",
      details: [
        fallbackAttempted
          ? `Homebrew upgrade and reinstall completed, but its stable AXM entrypoint still reports ${verification.managerVersion}.`
          : `Homebrew completed, but its stable AXM entrypoint still reports ${verification.managerVersion}.`,
        "Inspect brew info agentxm/tap/axm and Homebrew's linked keg before retrying.",
      ],
    };
  }
  if (verification.managerVersion !== targetVersion) {
    return {
      failure: "manager-version-mismatch",
      details: [
        `Homebrew's stable AXM entrypoint reports ${verification.managerVersion}; expected ${targetVersion}.`,
      ],
    };
  }
  if (verification.pathVersion === null) {
    return {
      failure: "path-version-unavailable",
      details: [
        `Homebrew's AXM reports ${targetVersion}, but a fresh PATH lookup could not report an AXM version.`,
        "Repair the AXM entry on PATH or open a fresh shell; AXM did not rewrite shell configuration.",
      ],
    };
  }
  if (verification.pathVersion !== verification.managerVersion) {
    return {
      failure: "manager-path-disagreement",
      details: [
        `Homebrew's AXM reports ${verification.managerVersion}, while PATH resolves AXM ${verification.pathVersion}.`,
        "Remove or relink the shadowing AXM executable shown in verification evidence.",
      ],
    };
  }
  return {
    failure: "path-version-mismatch",
    details: [`PATH-resolved AXM reports ${verification.pathVersion}; expected ${targetVersion}.`],
  };
};

const applyHomebrewUpgrade = Effect.fn("selfUpdate.applyHomebrew")(function* (
  input: PackageUpgradeInput,
) {
  const installer = yield* PackageInstaller;
  const workingDirectory = yield* UpgradeWorkingDirectory;
  const preparation = yield* installer.prepareHomebrew(input.targetVersion, workingDirectory.path);
  const { availability } = preparation;
  const preparationCommands = [...input.detectionCommands, ...preparation.commands];
  if (availability.state !== "ready") {
    const details =
      preparation.failure === "tap-query-failed"
        ? [
            "Homebrew could not list installed taps, so AXM did not attempt a package mutation.",
            "Resolve the reported Homebrew failure, then rerun axm upgrade.",
          ]
        : preparation.failure === "tap-preparation-failed"
          ? [
              "Homebrew could not prepare agentxm/tap, so AXM did not attempt a package mutation.",
              "Resolve the reported tap failure, then rerun axm upgrade.",
            ]
          : availability.details;
    return {
      ...upgradeBaseFacts(input),
      resultStatus: "upgrade-incomplete",
      reportedVersion: input.localVersion,
      verification: "not-attempted",
      mutationState: "not-attempted",
      verificationExecutables: [],
      executedCommands: preparationCommands,
      recommendedCommand: null,
      details,
      backupPath: null,
      homebrewFailure: preparation.failure,
      observedFormulaVersion: availability.observedVersion,
      availability,
    } satisfies UpgradeCoreResult;
  }

  const before = yield* installer.inspect(input.method, "pre-mutation", workingDirectory.path);
  const reinstall = input.relation === "current" && input.reinstall;
  const primary = yield* installer.mutate(
    input.method,
    input.targetVersion,
    reinstall,
    workingDirectory.path,
  );
  const primaryCommands = [...preparationCommands, ...before.commands, primary.result];
  if (primary.result.executionState === "not-started") {
    return {
      ...upgradeBaseFacts(input),
      resultStatus: "upgrade-incomplete",
      reportedVersion: input.localVersion,
      verification: "not-attempted",
      mutationState: "not-attempted",
      verificationExecutables: before.executables,
      executedCommands: primaryCommands,
      recommendedCommand: null,
      details: [
        "Homebrew did not start the selected AXM mutation.",
        "Resolve the executable or permission failure shown in command evidence, then rerun axm upgrade.",
      ],
      backupPath: null,
      homebrewFailure: "delegation-failed",
      observedFormulaVersion: availability.observedVersion,
      availability,
    } satisfies UpgradeCoreResult;
  }

  const afterPrimary = yield* installer.inspect(
    input.method,
    "post-primary",
    workingDirectory.path,
  );
  const primaryExecutables = [...before.executables, ...afterPrimary.executables];
  const observedCommands = [...primaryCommands, ...afterPrimary.commands];
  const baselineVersion = before.managerVersion ?? input.localVersion;
  if (primary.result.executionState !== "exited" || primary.result.exitCode !== 0) {
    return {
      ...upgradeBaseFacts(input),
      resultStatus: "upgrade-incomplete",
      ...verifyHomebrewInstallation(afterPrimary, baselineVersion, input.targetVersion),
      verificationExecutables: primaryExecutables,
      executedCommands: observedCommands,
      recommendedCommand: null,
      details: [
        primary.result.executionState === "timed-out"
          ? "Homebrew started but did not finish before the upgrade deadline."
          : "Homebrew exited without completing the selected AXM mutation.",
        "Inspect the recorded Homebrew output and verified executable state before retrying.",
      ],
      backupPath: null,
      homebrewFailure: "delegation-failed",
      observedFormulaVersion: availability.observedVersion,
      availability,
    } satisfies UpgradeCoreResult;
  }

  const recovery = yield* Effect.gen(function* () {
    if (!shouldReinstallHomebrew(reinstall, before, afterPrimary, input.targetVersion)) {
      return {
        after: afterPrimary,
        commands: observedCommands,
        executables: primaryExecutables,
        attempted: false,
        failed: false,
      };
    }
    const fallback = yield* installer.mutate(
      input.method,
      input.targetVersion,
      true,
      workingDirectory.path,
    );
    const after =
      fallback.result.executionState === "not-started"
        ? afterPrimary
        : yield* installer.inspect(input.method, "post-fallback", workingDirectory.path);
    const inspected = fallback.result.executionState !== "not-started";
    return {
      after,
      commands: [...observedCommands, fallback.result, ...(inspected ? after.commands : [])],
      executables: [...primaryExecutables, ...(inspected ? after.executables : [])],
      attempted: true,
      failed: fallback.result.executionState !== "exited" || fallback.result.exitCode !== 0,
    };
  });
  const summary = verifyHomebrewInstallation(recovery.after, baselineVersion, input.targetVersion);
  if (recovery.failed) {
    return {
      ...upgradeBaseFacts(input),
      resultStatus: "upgrade-incomplete",
      ...summary,
      verificationExecutables: recovery.executables,
      executedCommands: recovery.commands,
      recommendedCommand: null,
      details: [
        "Homebrew's one-shot reinstall recovery did not complete.",
        "Inspect the recorded Homebrew output and verified executable state before retrying.",
      ],
      backupPath: null,
      homebrewFailure: "delegation-failed",
      observedFormulaVersion: availability.observedVersion,
      availability,
    } satisfies UpgradeCoreResult;
  }
  if (summary.verification !== "verified") {
    const failure = homebrewVerificationFailure(
      recovery.after,
      baselineVersion,
      input.targetVersion,
      recovery.attempted,
    );
    return {
      ...upgradeBaseFacts(input),
      resultStatus:
        summary.verification === "unavailable" ? "upgrade-unverified" : "upgrade-incomplete",
      ...summary,
      verificationExecutables: recovery.executables,
      executedCommands: recovery.commands,
      recommendedCommand: null,
      details: failure.details,
      backupPath: null,
      homebrewFailure: failure.failure,
      observedFormulaVersion: availability.observedVersion,
      availability,
    } satisfies UpgradeCoreResult;
  }

  const recorder = yield* InstallationRecorder;
  const recorded = yield* recorder.record(input.method, recovery.after.managerPath).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
  return {
    ...upgradeBaseFacts(input),
    executablePath: recovery.after.managerPath,
    resultStatus: recorded ? (reinstall ? "reinstalled" : "upgraded") : "upgrade-incomplete",
    ...summary,
    verificationExecutables: recovery.executables,
    executedCommands: recovery.commands,
    recommendedCommand: null,
    details: recorded ? [] : ["AXM was updated, but install metadata could not be persisted."],
    backupPath: null,
    observedFormulaVersion: availability.observedVersion,
    availability,
  } satisfies UpgradeCoreResult;
});

/** Own mutation/verification ordering, bounded recovery, and acceptance independently of any installer SDK. */
const applyRegistryPackageUpgrade = Effect.fn("selfUpdate.applyRegistryPackage")(function* (
  input: PackageUpgradeInput,
) {
  const installer = yield* PackageInstaller;
  const workingDirectory = yield* UpgradeWorkingDirectory;
  const reinstall = input.relation === "current" && input.reinstall;
  const delegation = yield* installer.mutate(
    input.method,
    input.targetVersion,
    reinstall,
    workingDirectory.path,
  );
  const commands = [...input.detectionCommands, delegation.result];
  if (delegation.result.exitCode !== 0) {
    return {
      ...upgradeBaseFacts(input),
      resultStatus: "upgrade-incomplete",
      reportedVersion: null,
      verification: "not-attempted",
      mutationState: "unknown",
      verificationExecutables: [],
      executedCommands: commands,
      recommendedCommand: delegation.command,
      details: [
        `${input.method._tag === "Yarn" ? "Yarn" : delegation.command.executable} exited without completing the upgrade.`,
      ],
      backupPath: null,
    } satisfies UpgradeCoreResult;
  }

  const observed = yield* installer.inspect(input.method, "post-primary", workingDirectory.path);
  const verification = verifyPackageInstallation(
    observed.executables.map((entry) => entry.reportedVersion),
    input.localVersion,
    input.targetVersion,
  );
  const verifiedCommands = [...commands, ...observed.commands];
  if (verification.verification !== "verified") {
    return {
      ...upgradeBaseFacts(input),
      resultStatus:
        verification.verification === "unavailable" ? "upgrade-unverified" : "upgrade-incomplete",
      ...verification,
      verificationExecutables: observed.executables,
      executedCommands: verifiedCommands,
      recommendedCommand: delegation.command,
      details: [],
      backupPath: null,
    } satisfies UpgradeCoreResult;
  }
  const recorder = yield* InstallationRecorder;
  const recorded = yield* recorder.record(input.method, methodExecutablePath(input.method)).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
  return {
    ...upgradeBaseFacts(input),
    resultStatus: recorded ? (reinstall ? "reinstalled" : "upgraded") : "upgrade-incomplete",
    ...verification,
    verificationExecutables: observed.executables,
    executedCommands: verifiedCommands,
    recommendedCommand: recorded ? null : delegation.command,
    details: recorded ? [] : ["AXM was updated, but install metadata could not be persisted."],
    backupPath: null,
  } satisfies UpgradeCoreResult;
});

/** Availability, mutation, verification, recovery, and recording are one application operation. */
export const applyPackageUpgrade = Effect.fn("selfUpdate.applyPackageUpgrade")(function* (
  input: PackageUpgradeInput,
) {
  const observer = yield* UpgradeExecutionObserver;
  const mutation = {
    kind: "mutation",
    method: input.method,
    targetVersion: input.targetVersion,
  } as const;
  if (input.method._tag === "Homebrew") {
    return yield* observer.during(mutation, applyHomebrewUpgrade(input));
  }
  const installer = yield* PackageInstaller;
  const workingDirectory = yield* UpgradeWorkingDirectory;
  const observed = yield* observer.during(
    { kind: "availability", method: input.method },
    installer.availability(input.method, input.targetVersion, workingDirectory.path),
  );
  const prepared: PackageUpgradeInput = {
    ...input,
    detectionCommands: [...input.detectionCommands, ...observed.commands],
  };
  if (observed.availability.state !== "ready") {
    return {
      ...noMutationResult(prepared, "manual-action-required", null, observed.availability.details),
      availability: observed.availability,
    } satisfies UpgradeCoreResult;
  }
  const result = yield* observer.during(mutation, applyRegistryPackageUpgrade(prepared));
  return { ...result, availability: observed.availability } satisfies UpgradeCoreResult;
});

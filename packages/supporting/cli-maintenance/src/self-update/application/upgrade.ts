import * as Effect from "effect/Effect";
import { methodName } from "../domain/index.js";
import { applyPackageUpgrade } from "./apply-package-upgrade.js";
import { applyScriptUpgrade } from "./apply-script-upgrade.js";
import { UpgradeFailed } from "./errors.js";
import { noMutationResult, upgradeBaseFacts, type BaseResultInput } from "./execution-facts.js";
import type {
  InstallerAvailability,
  UpgradeCoreResult,
  UpgradePreviewIntent,
  UpgradeSettlement,
} from "./execution-result.js";
import { InstallationInspection } from "./installation.js";
import { InstallerInstructions } from "./installer-instructions.js";
import { InstallationRecorder, PackageInstaller } from "./package-installer.js";
import { prepareUpgrade, type UpgradeCandidate, type UpgradeRequest } from "./preparation.js";
import { CliReleaseCatalog } from "./releases.js";
import { ScriptExecutableInstaller, ScriptReleaseAssets } from "./script-installer.js";
import { rememberLatestRelease } from "./startup-check.js";
import { UpdateCheckCache } from "./update-cache.js";
import { UpgradeWorkingDirectory } from "./working-directory.js";

const notRequired: InstallerAvailability = {
  state: "not-required",
  observedVersion: null,
  details: [],
};

const baseInput = (candidate: UpgradeCandidate): BaseResultInput => ({
  method: candidate.method,
  detectionCommands: candidate.detectionCommands,
  relation: candidate.resolution.versionRelation,
  localVersion: candidate.resolution.localVersion,
  targetVersion: candidate.resolution.targetVersion,
  reinstall: candidate.request.reinstall,
});

const settle = (
  candidate: UpgradeCandidate,
  result: UpgradeCoreResult,
  availability: InstallerAvailability,
  previewIntent: UpgradePreviewIntent | null,
): UpgradeSettlement => {
  const { availability: observedAvailability, ...executionResult } = result;
  return {
    result: executionResult,
    previewIntent,
    resolution: candidate.resolution,
    platform: candidate.platform,
    requestedVersion: candidate.request.requestedVersion,
    availability: observedAvailability ?? availability,
  };
};

const unchangedResult = (candidate: UpgradeCandidate) =>
  Effect.gen(function* () {
    const input = baseInput(candidate);
    switch (candidate.selectedAction) {
      case "noop-current":
        return noMutationResult(input, "already-up-to-date", null);
      case "noop-newer":
        return noMutationResult(input, "local-newer", null);
      case "refuse":
        return noMutationResult(input, "downgrade-refused", null);
      case "manual": {
        const instructions = yield* InstallerInstructions;
        return noMutationResult(
          input,
          "manual-action-required",
          instructions.recoveryCommand(input.targetVersion),
        );
      }
      case "mutate":
        return null;
    }
  });

/** Resolve a prospective change using only inspection, release reads, and installer grammar. */
export const assessUpgrade: (
  request: UpgradeRequest,
) => Effect.Effect<
  UpgradeSettlement,
  UpgradeFailed,
  InstallationInspection | CliReleaseCatalog | UpgradeWorkingDirectory | InstallerInstructions
> = Effect.fn("SelfUpdate.assessUpgrade")(function* (request: UpgradeRequest) {
  const candidate = yield* prepareUpgrade(request);
  const unchanged = yield* unchangedResult(candidate);
  if (unchanged !== null) return settle(candidate, unchanged, notRequired, null);

  const input = baseInput(candidate);
  const { method, platform } = candidate;
  const instructions = yield* InstallerInstructions;
  const intent: UpgradePreviewIntent = (() => {
    if (method._tag === "Script") {
      return {
        kind: "executable-replacement",
        executablePath: method.execPath,
        binaryName: platform.binaryName,
        targetVersion: input.targetVersion,
      };
    }
    const command =
      method._tag === "Unknown"
        ? null
        : instructions.packageCommand(
            method,
            input.targetVersion,
            input.relation === "current" && input.reinstall,
          );
    return command === null
      ? { kind: "installer-unavailable", method: methodName(method) }
      : { kind: "package-command", command };
  })();
  return settle(
    candidate,
    {
      ...upgradeBaseFacts(input),
      resultStatus: "preview",
      reportedVersion: null,
      verification: "not-attempted",
      mutationState: "not-attempted",
      verificationExecutables: [],
      executedCommands: input.detectionCommands,
      recommendedCommand: null,
      details: [],
      backupPath: null,
    },
    notRequired,
    intent,
  );
});

/** Apply the prepared decision through the owning installer, preserving its verification facts. */
export const applyUpgrade: (
  candidate: UpgradeCandidate,
) => Effect.Effect<
  UpgradeSettlement,
  UpgradeFailed,
  | InstallationRecorder
  | PackageInstaller
  | ScriptExecutableInstaller
  | ScriptReleaseAssets
  | UpdateCheckCache
  | UpgradeWorkingDirectory
  | InstallerInstructions
> = Effect.fn("SelfUpdate.applyUpgrade")(function* (candidate: UpgradeCandidate) {
  const { method, platform, resolution } = candidate;
  if (resolution.source === "github-latest") {
    yield* rememberLatestRelease(resolution.targetVersion);
  }
  const unchanged = yield* unchangedResult(candidate);
  if (unchanged !== null) return settle(candidate, unchanged, notRequired, null);

  const input = baseInput(candidate);
  const result = yield* Effect.gen(function* () {
    if (method._tag === "Script") {
      const { binaryAssetUrl, checksumAssetUrl } = resolution.release;
      if (binaryAssetUrl === null || checksumAssetUrl === null) {
        return yield* new UpgradeFailed({
          category: "unavailable",
          detail: "Selected release assets are not ready",
        });
      }
      const instructions = yield* InstallerInstructions;
      return yield* applyScriptUpgrade({
        ...input,
        method,
        binaryName: platform.binaryName,
        release: { binaryAssetUrl, checksumAssetUrl },
        recoveryCommand: instructions.recoveryCommand(input.targetVersion),
      });
    }
    if (method._tag === "Unknown") {
      const instructions = yield* InstallerInstructions;
      return noMutationResult(
        input,
        "manual-action-required",
        instructions.recoveryCommand(input.targetVersion),
      );
    }
    return yield* applyPackageUpgrade({ ...input, method });
  });
  return settle(
    candidate,
    result,
    { state: "ready", observedVersion: resolution.targetVersion, details: [] },
    null,
  );
});

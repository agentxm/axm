/**
 * Assessment and installer application for updating the
 * installed `axm` executable.
 *
 * CLI maintenance prepares the immutable candidate through its owned application ports.
 * `previewOrApply` presents that immutable
 * candidate and, on apply, establishes publication availability through the
 * owning installer, performs the mutation, verifies it, and records the
 * install metadata. Every termination resolves to one
 * settlement of execution facts. The CLI adapter maps those facts to its document.
 *
 * `AssessUpgrade.query` is the read-only entry point: the same candidate,
 * presented and never applied.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import {
  applyPackageUpgrade,
  applyScriptUpgrade,
  ScriptExecutableInstaller,
  ScriptReleaseAssets,
  PackageInstaller,
  InstallationRecorder,
  noMutationResult,
  type BaseResultInput,
  type InstallerAvailability,
  type UpgradeCoreResult,
  type UpgradeSettlement,
} from "@agentxm/cli-maintenance/self-update/application";

import {
  UpdateCheckCache,
  rememberStableChannel,
} from "@agentxm/cli-maintenance/self-update/application";
import {
  CliReleaseCatalog,
  prepareUpgrade,
  InstallationInspection,
  UpgradeWorkingDirectory,
  type UpgradeRequest,
  type UpgradeCandidate,
  UpgradeFailed,
} from "@agentxm/cli-maintenance/self-update/application";
import { previewResult, recoveryInstaller } from "./mechanism.js";

/** How the prepared candidate is settled. */
export interface UpgradeExecution {
  readonly mode: "preview" | "apply";
}

type UpgradeRequirements =
  | InstallationRecorder
  | PackageInstaller
  | ScriptExecutableInstaller
  | ScriptReleaseAssets
  | UpdateCheckCache
  | UpgradeWorkingDirectory;

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

/**
 * Present the prepared candidate and, on apply, gate on publication
 * availability, mutate through the owning installer, verify, and record. A
 * preview establishes no publication state, writes no channel cache, and
 * records no install metadata.
 */
export const previewOrApply: (
  candidate: UpgradeCandidate,
  execution: UpgradeExecution,
) => Effect.Effect<UpgradeSettlement, UpgradeFailed, UpgradeRequirements> = Effect.fn(
  "PerformUpgrade.previewOrApply",
)(function* (candidate: UpgradeCandidate, execution: UpgradeExecution) {
  const preview = execution.mode === "preview";
  const { method, platform, resolution, selectedAction } = candidate;
  const targetVersion = resolution.targetVersion;

  // A preview leaves no trace: the channel cache is durable state the command
  // was not asked to change.
  if (resolution.channel !== null && !preview) {
    yield* rememberStableChannel(resolution.channel, resolution.etag);
  }

  const input = baseInput(candidate);
  const action = selectedAction;
  const availability: InstallerAvailability =
    action === "mutate" && !preview
      ? { state: "ready", observedVersion: targetVersion, details: [] }
      : notRequired;

  const settle = (result: UpgradeCoreResult): UpgradeSettlement => {
    const { availability: installerAvailability, ...executionResult } = result;
    return {
      result: executionResult,
      resolution,
      platform,
      requestedVersion: candidate.request.requestedVersion,
      availability: installerAvailability ?? availability,
    };
  };

  if (preview && action === "mutate") {
    return settle(previewResult(input, platform.binaryName));
  }

  const resultEffect: Effect.Effect<UpgradeCoreResult, UpgradeFailed, UpgradeRequirements> =
    (() => {
      switch (action) {
        case "noop-current":
          return Effect.succeed(noMutationResult(input, "already-up-to-date", null));
        case "noop-newer":
          return Effect.succeed(noMutationResult(input, "local-newer", null));
        case "refuse":
          return Effect.succeed(noMutationResult(input, "downgrade-refused", null));
        case "manual":
          return Effect.succeed(
            noMutationResult(input, "manual-action-required", recoveryInstaller(targetVersion)),
          );
        case "mutate": {
          if (method._tag === "Script") {
            const binaryAssetUrl = resolution.release.binaryAssetUrl;
            const checksumAssetUrl = resolution.release.checksumAssetUrl;
            if (binaryAssetUrl === null || checksumAssetUrl === null) {
              return Effect.fail(
                new UpgradeFailed({
                  category: "unavailable",
                  detail: "Selected release assets are not ready",
                }),
              );
            }
            return applyScriptUpgrade({
              ...input,
              method,
              binaryName: platform.binaryName,
              release: { binaryAssetUrl, checksumAssetUrl },
              recoveryCommand: recoveryInstaller(input.targetVersion),
            });
          }
          return method._tag === "Unknown"
            ? Effect.succeed(
                noMutationResult(input, "manual-action-required", recoveryInstaller(targetVersion)),
              )
            : applyPackageUpgrade({ ...input, method });
        }
      }
    })();

  const result = yield* resultEffect;
  return settle(result);
});

/** The read-only assessment: the prepared candidate, presented, never applied. */
export const query: (
  request: UpgradeRequest,
) => Effect.Effect<
  UpgradeSettlement,
  UpgradeFailed,
  UpgradeRequirements | InstallationInspection | CliReleaseCatalog
> = Effect.fn("AssessUpgrade.query")(function* (request: UpgradeRequest) {
  const candidate = yield* prepareUpgrade(request);
  return yield* previewOrApply(candidate, { mode: "preview" });
});

/** The read-only application API for reporting what an upgrade would do. */
export const AssessUpgrade = { query } as const;

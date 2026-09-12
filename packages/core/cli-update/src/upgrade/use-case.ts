/**
 * Assessment and installer application for updating the
 * installed `axm` executable.
 *
 * CLI maintenance prepares the immutable candidate through its owned application ports.
 * `previewOrApply` presents that immutable
 * candidate and, on apply, establishes publication availability through the
 * owning installer, performs the mutation, verifies it, and records the
 * install metadata. Every termination resolves to one
 * `axm.upgrade-assessment/v1` result.
 *
 * `AssessUpgrade.query` is the read-only entry point: the same candidate,
 * presented and never applied.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { observeUnit } from "@agentxm/workspace-operations";

import { InstallMeta } from "../install-meta/install-meta.js";
import { Subprocess } from "../subprocess/subprocess.js";
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
import {
  methodName,
  handleDelegated,
  handleScript,
  methodLabel,
  noMutationResult,
  previewResult,
  queryPackageAvailability,
  recoveryInstaller,
  toUpgradeAssessment,
  type BaseResultInput,
  type InstallerAvailability,
  type UpgradeAssessmentResult,
  type UpgradeCoreResult,
} from "./mechanism.js";

/** How the prepared candidate is settled. */
export interface UpgradeExecution {
  readonly mode: "preview" | "apply";
}

type UpgradeRequirements =
  | InstallMeta
  | Subprocess
  | UpdateCheckCache
  | UpgradeWorkingDirectory
  | HttpClient.HttpClient
  | FileSystem.FileSystem
  | Path.Path;

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
) => Effect.Effect<UpgradeAssessmentResult, UpgradeFailed, UpgradeRequirements> = Effect.fn(
  "PerformUpgrade.previewOrApply",
)(function* (candidate: UpgradeCandidate, execution: UpgradeExecution) {
  const preview = execution.mode === "preview";
  const { method, platform, resolution, selectedAction } = candidate;
  const targetVersion = resolution.targetVersion;
  const detectionCommands = [...candidate.detectionCommands];
  const input: BaseResultInput = { ...baseInput(candidate), detectionCommands };

  // A preview leaves no trace: the channel cache is durable state the command
  // was not asked to change.
  if (resolution.channel !== null && !preview) {
    yield* rememberStableChannel(resolution.channel, resolution.etag);
  }

  // A preview resolves ownership and the target and stops: publication state
  // is established by the run that would use it.
  const availability: InstallerAvailability =
    selectedAction !== "mutate" || preview
      ? notRequired
      : method._tag === "Npm" || method._tag === "Pnpm" || method._tag === "Yarn"
        ? yield* observeUnit(
            {
              id: "availability",
              label: `${methodLabel(methodName(method))} availability`,
            },
            queryPackageAvailability(method, targetVersion, detectionCommands),
          )
        : { state: "ready", observedVersion: targetVersion, details: [] };

  // The availability gate exists to stop a mutation that would fail. A
  // preview performs none, so it is not gated by publication state it
  // deliberately did not establish.
  const action =
    !preview && selectedAction === "mutate" && availability.state !== "ready"
      ? "manual"
      : selectedAction;

  const assess = (result: UpgradeCoreResult): UpgradeAssessmentResult =>
    toUpgradeAssessment({
      result,
      resolution,
      platform,
      requestedVersion: candidate.request.requestedVersion,
      availability,
    });

  if (preview && action === "mutate") {
    return assess(previewResult(input, platform.binaryName));
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
          if (selectedAction === "mutate") {
            return Effect.succeed({
              ...noMutationResult(input, "manual-action-required", null, availability.details),
              availability,
            });
          }
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
            return handleScript(input, method, platform, {
              binaryAssetUrl,
              checksumAssetUrl,
            });
          }
          return handleDelegated(input);
        }
      }
    })();

  // The mutation unit stays on screen for the whole delegation, so its label
  // carries the two facts the reader needs while it runs: what is being
  // installed and which installer is doing it. The commands the installer
  // runs nest under it.
  const result =
    action === "mutate"
      ? yield* observeUnit(
          {
            id: "upgrade",
            label: `AXM ${targetVersion} via ${methodLabel(methodName(method))}`,
          },
          resultEffect,
        )
      : yield* resultEffect;
  return assess(result);
});

/** The read-only assessment: the prepared candidate, presented, never applied. */
export const query: (
  request: UpgradeRequest,
) => Effect.Effect<
  UpgradeAssessmentResult,
  UpgradeFailed,
  UpgradeRequirements | InstallationInspection | CliReleaseCatalog
> = Effect.fn("AssessUpgrade.query")(function* (request: UpgradeRequest) {
  const candidate = yield* prepareUpgrade(request);
  return yield* previewOrApply(candidate, { mode: "preview" });
});

/** The read-only application API for reporting what an upgrade would do. */
export const AssessUpgrade = { query } as const;

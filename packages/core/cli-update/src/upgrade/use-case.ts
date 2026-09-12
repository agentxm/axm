/**
 * `AssessUpgrade` and `PerformUpgrade`: the application API for updating the
 * installed `axm` executable.
 *
 * `prepare` resolves the platform, the installation's owning installer, and
 * the release the request selects, and decides what the upgrade would do. It
 * reads installation and release facts without applying the upgrade.
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

import {
  type InstallMethodType,
  decideUpgrade,
  resolvePlatformBinary,
  supportedMethod,
  type PlatformBinaryInfo,
  type UpgradeAction,
} from "@agentxm/cli-maintenance/self-update/domain";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";

import { observeUnit } from "@agentxm/workspace-operations";

import { UpgradeFailed } from "../errors.js";
import { InstallMeta } from "../install-meta/install-meta.js";
import { InstallMethod } from "../install-method/install-method.js";
import { Subprocess } from "../subprocess/subprocess.js";
import { UpdateCheck } from "../update-check/update-check.js";
import type { VersionResolutionResult } from "../version-resolution/version-resolution.js";
import {
  resolveExactVersion,
  resolveLatestVersion,
} from "../version-resolution/version-resolution.js";
import { UpgradeWorkingDirectory } from "./working-directory.js";
import {
  methodName,
  handleDelegated,
  handleScript,
  methodLabel,
  noMutationResult,
  previewResult,
  queryPackageAvailability,
  recoveryInstaller,
  resolveAmbiguousPackageManager,
  toUpgradeAssessment,
  type BaseResultInput,
  type CommandRecord,
  type InstallerAvailability,
  type UpgradeAssessmentResult,
  type UpgradeCoreResult,
} from "./mechanism.js";

/** What the caller asked the self-update capability to do. */
export interface UpgradeRequest {
  /** Reinstall an equal version; never permits a downgrade. */
  readonly reinstall: boolean;
  /** An exact stable version. Omit to use the promoted stable channel. */
  readonly requestedVersion?: string | undefined;
  /** The version the running executable reports, or `null` when unreadable. */
  readonly localVersion: string | null;
}

/** How the prepared candidate is settled. */
export interface UpgradeExecution {
  readonly mode: "preview" | "apply";
}

/**
 * The resolved, immutable upgrade the request selects. Presenting it and
 * applying it read the same ownership, the same release, and the same
 * decision.
 */
export interface UpgradeCandidate {
  readonly request: UpgradeRequest;
  readonly platform: PlatformBinaryInfo;
  readonly method: InstallMethodType;
  readonly resolution: VersionResolutionResult;
  readonly selectedAction: UpgradeAction;
  readonly detectionCommands: ReadonlyArray<CommandRecord>;
}

type UpgradeRequirements =
  | InstallMethod
  | InstallMeta
  | Subprocess
  | UpdateCheck
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
 * Resolve ownership before release selection: an installation whose owner
 * cannot be determined is refused without a release-authority request.
 */
export const prepare: (
  request: UpgradeRequest,
) => Effect.Effect<UpgradeCandidate, UpgradeFailed, UpgradeRequirements> = Effect.fn(
  "PerformUpgrade.prepare",
)(function* (request: UpgradeRequest) {
  const platform = resolvePlatformBinary(process.platform, process.arch);
  if (Option.isNone(platform)) {
    return yield* Effect.fail(
      new UpgradeFailed({
        category: "validation",
        detail: `Unsupported platform: ${process.platform}-${process.arch}`,
        suggestions: [{ description: "Use a supported AXM platform." }],
      }),
    );
  }

  const localVersion = request.localVersion === null ? null : semver.valid(request.localVersion);
  const installMethod = yield* InstallMethod;
  const detectionCommands: Array<CommandRecord> = [];

  // Detection and its ownership disambiguation are one unit: the probes the
  // ambiguous case runs are that unit's work, and the label it settles with
  // names the owner it actually resolved, not the first guess.
  const method = yield* observeUnit(
    {
      id: "detect-install-method",
      label: "AXM installation method",
      resolvedLabel: (resolved: InstallMethodType) =>
        resolved._tag === "Unknown"
          ? "AXM installation method — undetermined"
          : `AXM installed with ${methodLabel(methodName(resolved))}`,
    },
    Effect.gen(function* () {
      const detected = yield* installMethod.detect();
      return yield* resolveAmbiguousPackageManager(detected, detectionCommands);
    }),
  );
  if (method._tag === "Unknown") {
    return yield* Effect.fail(
      new UpgradeFailed({
        category: "validation",
        detail: "Could not determine how AXM was installed",
        suggestions: [
          {
            description:
              "Reinstall AXM with the script installer, Homebrew, npm, pnpm, or Yarn Classic, then retry.",
          },
        ],
      }),
    );
  }

  const resolution =
    request.requestedVersion === undefined
      ? yield* observeUnit(
          {
            id: "resolve-channel",
            label: "AXM stable channel",
            resolvedLabel: (selected: VersionResolutionResult) =>
              `AXM stable channel — ${selected.targetVersion}`,
          },
          Effect.gen(function* () {
            const httpClient = yield* HttpClient.HttpClient;
            return yield* resolveLatestVersion(httpClient, localVersion, platform.value.binaryName);
          }),
        )
      : yield* observeUnit(
          { id: "resolve-version", label: `AXM ${request.requestedVersion}` },
          resolveExactVersion(request.requestedVersion, localVersion, platform.value.binaryName),
        );

  if (semver.valid(resolution.targetVersion) === null) {
    return yield* Effect.fail(
      new UpgradeFailed({
        category: "validation",
        detail: "The selected upgrade target is not valid semantic version",
      }),
    );
  }

  return {
    request,
    platform: platform.value,
    method,
    resolution,
    selectedAction: decideUpgrade(
      resolution.versionRelation,
      request.reinstall,
      supportedMethod(method),
    ),
    detectionCommands,
  };
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
    const updateCheck = yield* UpdateCheck;
    yield* updateCheck.writeCache(resolution.channel, resolution.etag);
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
) => Effect.Effect<UpgradeAssessmentResult, UpgradeFailed, UpgradeRequirements> = Effect.fn(
  "AssessUpgrade.query",
)(function* (request: UpgradeRequest) {
  const candidate = yield* prepare(request);
  return yield* previewOrApply(candidate, { mode: "preview" });
});

/** The application API for updating the installed `axm` executable. */
export const PerformUpgrade = { prepare, previewOrApply } as const;

/** The read-only application API for reporting what an upgrade would do. */
export const AssessUpgrade = { query } as const;

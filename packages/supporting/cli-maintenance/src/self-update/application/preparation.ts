import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  decideUpgrade,
  resolvePlatformBinary,
  supportedMethod,
  type InstallMethodType,
  type PlatformBinaryInfo,
  type UpgradeAction,
} from "../domain/index.js";
import { UpgradeFailed } from "./errors.js";
import type { CommandRecord } from "./evidence.js";
import { InstallationInspection } from "./installation.js";
import { selectUpgradeRelease } from "./release-selection.js";
import { CliReleaseCatalog, type VersionResolutionResult } from "./releases.js";
import { UpgradeWorkingDirectory } from "./working-directory.js";

export interface UpgradeRequest {
  /** Reinstall an equal version; never permits a downgrade. */
  readonly reinstall: boolean;
  /** An exact stable version. Omit to use the promoted stable channel. */
  readonly requestedVersion?: string | undefined;
  readonly localVersion: string | null;
}

/** The immutable candidate shared by preview and application. */
export interface UpgradeCandidate {
  readonly request: UpgradeRequest;
  readonly platform: PlatformBinaryInfo;
  readonly method: InstallMethodType;
  readonly resolution: VersionResolutionResult;
  readonly selectedAction: UpgradeAction;
  readonly detectionCommands: ReadonlyArray<CommandRecord>;
}

/** Establish ownership before release selection, without any mutation capability. */
export const prepareUpgrade: (
  request: UpgradeRequest,
) => Effect.Effect<
  UpgradeCandidate,
  UpgradeFailed,
  InstallationInspection | CliReleaseCatalog | UpgradeWorkingDirectory
> = Effect.fn("SelfUpdate.prepareUpgrade")(function* (request: UpgradeRequest) {
  const inspection = yield* InstallationInspection;
  const platform = resolvePlatformBinary(inspection.platform, inspection.architecture);
  if (Option.isNone(platform)) {
    return yield* new UpgradeFailed({
      category: "validation",
      detail: `Unsupported platform: ${inspection.platform}-${inspection.architecture}`,
      suggestions: [{ description: "Use a supported AXM platform." }],
    });
  }

  const workingDirectory = yield* UpgradeWorkingDirectory;
  const inspected = yield* inspection.inspect(workingDirectory.path);
  if (inspected.method._tag === "Unknown") {
    return yield* new UpgradeFailed({
      category: "validation",
      detail: "Could not determine how AXM was installed",
      suggestions: [
        {
          description:
            "Reinstall AXM with the script installer, Homebrew, npm, pnpm, or Yarn Classic, then retry.",
        },
      ],
    });
  }

  const resolution = yield* selectUpgradeRelease({
    localVersion: request.localVersion,
    requestedVersion: request.requestedVersion,
    binaryName: platform.value.binaryName,
  });
  return {
    request,
    platform: platform.value,
    method: inspected.method,
    resolution,
    selectedAction: decideUpgrade(
      resolution.versionRelation,
      request.reinstall,
      supportedMethod(inspected.method),
    ),
    detectionCommands: inspected.commands,
  };
});

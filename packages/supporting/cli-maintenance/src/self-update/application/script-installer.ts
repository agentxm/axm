import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { CommandRecord } from "./evidence.js";
import type { UpgradeFailed } from "./errors.js";

export interface ScriptReleaseSource {
  readonly binaryAssetUrl: string;
  readonly checksumAssetUrl: string;
}

export interface DownloadedScriptRelease {
  readonly bytes: Uint8Array;
  readonly sha256Hex: string;
  readonly checksumManifest: string;
}

export class ScriptReleaseAssets extends Context.Service<
  ScriptReleaseAssets,
  {
    readonly read: (
      source: ScriptReleaseSource,
      binaryName: string,
    ) => Effect.Effect<DownloadedScriptRelease, UpgradeFailed>;
  }
>()("@agentxm/cli-maintenance/self-update/ScriptReleaseAssets") {}

export interface ScriptExecutableObservation {
  readonly reportedVersion: string | null;
  readonly command: CommandRecord;
}

/**
 * A scoped restorable executable. Successful restoration consumes the backup.
 * Acceptance releases it. Interruption restores an unaccepted replacement;
 * normal completion without acceptance preserves the installed file and backup.
 */
export interface StagedExecutable {
  readonly path: string;
  readonly backupPath: string;
  readonly protectOriginal: Effect.Effect<boolean>;
  readonly replace: Effect.Effect<boolean>;
  readonly restore: Effect.Effect<boolean>;
  readonly accept: Effect.Effect<void>;
}

export interface ExecutableReplacementLease {
  readonly targetPath: string;
  readonly stage: (
    bytes: Uint8Array,
  ) => Effect.Effect<StagedExecutable | null, UpgradeFailed, Scope.Scope>;
}

/** Lock and staging lifetimes belong to the caller's operation scope. */
export interface ScriptExecutableInstallerService {
  readonly acquire: (
    executablePath: string,
  ) => Effect.Effect<ExecutableReplacementLease | null, UpgradeFailed, Scope.Scope>;
  readonly inspect: (
    executablePath: string,
    purpose: "verification" | "rollback",
    workingDirectory: string,
  ) => Effect.Effect<ScriptExecutableObservation>;
}

export class ScriptExecutableInstaller extends Context.Service<
  ScriptExecutableInstaller,
  ScriptExecutableInstallerService
>()("@agentxm/cli-maintenance/self-update/ScriptExecutableInstaller") {}

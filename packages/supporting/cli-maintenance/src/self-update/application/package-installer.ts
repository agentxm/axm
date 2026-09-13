import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { InstallMethodType } from "../domain/index.js";
import type { CommandRecord } from "./evidence.js";
import type { UpgradeFailed } from "./errors.js";
import type {
  HomebrewFailure,
  InstallerAvailability,
  RecommendedCommand,
  VerificationExecutable,
} from "./execution-result.js";

export type PackageManagedInstallation = Extract<
  InstallMethodType,
  { readonly _tag: "Homebrew" | "Npm" | "Pnpm" | "Yarn" }
>;
export type RegistryManagedInstallation = Exclude<
  PackageManagedInstallation,
  { readonly _tag: "Homebrew" }
>;
export type InstallationInspectionPhase = "pre-mutation" | "post-primary" | "post-fallback";

export interface AvailabilityObservation {
  readonly availability: InstallerAvailability;
  readonly commands: ReadonlyArray<CommandRecord>;
  readonly failure?: HomebrewFailure;
}

export interface PackageInstallationObservation {
  readonly managerPath: string | null;
  readonly managerVersion: string | null;
  readonly pathVersion: string | null;
  readonly executables: ReadonlyArray<VerificationExecutable>;
  readonly commands: ReadonlyArray<CommandRecord>;
}

export interface PackageMutationObservation {
  readonly command: RecommendedCommand;
  readonly result: CommandRecord;
}

/** Installer protocol facts. The application decides whether to mutate, retry, or accept. */
export interface PackageInstallerService {
  readonly availability: (
    method: RegistryManagedInstallation,
    targetVersion: string,
    workingDirectory: string,
  ) => Effect.Effect<AvailabilityObservation, UpgradeFailed>;
  readonly prepareHomebrew: (
    targetVersion: string,
    workingDirectory: string,
  ) => Effect.Effect<AvailabilityObservation, UpgradeFailed>;
  readonly inspect: (
    method: PackageManagedInstallation,
    phase: InstallationInspectionPhase,
    workingDirectory: string,
  ) => Effect.Effect<PackageInstallationObservation, UpgradeFailed>;
  readonly mutate: (
    method: PackageManagedInstallation,
    targetVersion: string,
    reinstall: boolean,
    workingDirectory: string,
  ) => Effect.Effect<PackageMutationObservation, UpgradeFailed>;
}

export class PackageInstaller extends Context.Service<PackageInstaller, PackageInstallerService>()(
  "@agentxm/cli-maintenance/self-update/PackageInstaller",
) {}

/** Record only an installation whose observed version passed application policy. */
export class InstallationRecorder extends Context.Service<
  InstallationRecorder,
  {
    readonly record: (
      method: InstallMethodType,
      executablePath: string | null,
    ) => Effect.Effect<void, UpgradeFailed>;
  }
>()("@agentxm/cli-maintenance/self-update/InstallationRecorder") {}

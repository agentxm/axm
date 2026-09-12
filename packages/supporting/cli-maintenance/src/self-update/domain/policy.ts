import * as Option from "effect/Option";
import * as semver from "semver";

import type { InstallMethodType } from "./installation.js";

export type VersionRelation = "upgrade-available" | "current" | "local-newer" | "unknown-local";

export const classifyVersionRelation = (
  localVersion: string | null,
  targetVersion: string,
): { readonly localVersion: string | null; readonly versionRelation: VersionRelation } => {
  const validLocal = localVersion === null ? null : semver.valid(localVersion);
  if (validLocal === null) {
    return { localVersion: null, versionRelation: "unknown-local" };
  }
  const comparison = semver.compare(validLocal, targetVersion);
  return {
    localVersion: validLocal,
    versionRelation:
      comparison < 0 ? "upgrade-available" : comparison > 0 ? "local-newer" : "current",
  };
};

export interface PlatformBinaryInfo {
  readonly binaryName: string;
  readonly platform: string;
  readonly arch: string;
}

const SUPPORTED_TARGETS: ReadonlyArray<PlatformBinaryInfo> = [
  { platform: "darwin", arch: "arm64", binaryName: "axm-darwin-arm64" },
  { platform: "darwin", arch: "x64", binaryName: "axm-darwin-x64" },
  { platform: "linux", arch: "arm64", binaryName: "axm-linux-arm64" },
  { platform: "linux", arch: "x64", binaryName: "axm-linux-x64" },
  { platform: "win32", arch: "x64", binaryName: "axm-windows-x64.exe" },
];

export const resolvePlatformBinary = (platform: string, arch: string) => {
  const target = SUPPORTED_TARGETS.find(
    (candidate) => candidate.platform === platform && candidate.arch === arch,
  );
  return target === undefined ? Option.none<PlatformBinaryInfo>() : Option.some(target);
};

export type UpgradeAction = "noop-current" | "noop-newer" | "refuse" | "mutate" | "manual";

export const decideUpgrade = (
  relation: VersionRelation,
  reinstall: boolean,
  supportedMethod: boolean,
): UpgradeAction => {
  if (relation === "local-newer") return reinstall ? "refuse" : "noop-newer";
  if (relation === "current" && !reinstall) return "noop-current";
  return supportedMethod ? "mutate" : "manual";
};

export const supportedMethod = (method: InstallMethodType): boolean =>
  method._tag !== "Unknown" && (method._tag !== "Yarn" || method.managerMajorVersion === 1);

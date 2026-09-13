import * as semver from "semver";

export interface InstallationVerification {
  readonly verification: "verified" | "unchanged" | "mismatch" | "unavailable";
  readonly reportedVersion: string | null;
  readonly mutationState: "updated" | "unchanged" | "unknown";
}

/** A successful delegate exit does not establish which installation changed. */
export const verifyPackageInstallation = (
  observed: ReadonlyArray<string | null>,
  localVersion: string | null,
  targetVersion: string,
): InstallationVerification => {
  if (observed.length === 0 || observed.some((version) => version === null)) {
    return {
      verification: "unavailable",
      reportedVersion: observed.find((version) => version !== null) ?? null,
      mutationState: "unknown",
    };
  }
  const first = observed[0] ?? null;
  if (observed.some((version) => version !== first)) {
    return { verification: "mismatch", reportedVersion: first, mutationState: "updated" };
  }
  if (first === targetVersion) {
    return { verification: "verified", reportedVersion: first, mutationState: "updated" };
  }
  if (first === localVersion) {
    return { verification: "unchanged", reportedVersion: first, mutationState: "unchanged" };
  }
  return { verification: "mismatch", reportedVersion: first, mutationState: "updated" };
};

export interface HomebrewInstallation {
  readonly managerVersion: string | null;
  readonly pathVersion: string | null;
}

/** Homebrew's stable entry and the executable on PATH must agree on the target. */
export const verifyHomebrewInstallation = (
  observed: HomebrewInstallation,
  baselineVersion: string | null,
  targetVersion: string,
): InstallationVerification => {
  if (observed.managerVersion === null || observed.pathVersion === null) {
    return {
      verification: "unavailable",
      reportedVersion: observed.managerVersion ?? observed.pathVersion,
      mutationState: "unknown",
    };
  }
  if (observed.managerVersion !== observed.pathVersion) {
    return {
      verification: "mismatch",
      reportedVersion: observed.managerVersion,
      mutationState:
        observed.managerVersion === targetVersion || observed.pathVersion === targetVersion
          ? "updated"
          : "unknown",
    };
  }
  if (observed.managerVersion === targetVersion) {
    return { verification: "verified", reportedVersion: targetVersion, mutationState: "updated" };
  }
  if (observed.managerVersion === baselineVersion) {
    return {
      verification: "unchanged",
      reportedVersion: baselineVersion,
      mutationState: "unchanged",
    };
  }
  return {
    verification: "mismatch",
    reportedVersion: observed.managerVersion,
    mutationState: "unknown",
  };
};

/** Only an unchanged, older Homebrew installation earns one reinstall recovery. */
export const shouldReinstallHomebrew = (
  reinstall: boolean,
  before: HomebrewInstallation,
  after: HomebrewInstallation,
  targetVersion: string,
): boolean =>
  !reinstall &&
  before.managerVersion !== null &&
  after.managerVersion === before.managerVersion &&
  semver.lt(before.managerVersion, targetVersion);

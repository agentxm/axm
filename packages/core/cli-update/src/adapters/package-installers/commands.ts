import {
  supportedMethod,
  type InstallMethodType,
} from "@agentxm/cli-maintenance/self-update/domain";
import type { RecommendedCommand } from "@agentxm/cli-maintenance/self-update/application";

export const HOMEBREW_TAP = "agentxm/tap";
export const HOMEBREW_FORMULA = `${HOMEBREW_TAP}/axm`;
export const NPM_PACKAGE = "axm.sh";
export const HOMEBREW_ENV = { HOMEBREW_NO_AUTO_UPDATE: "1" } as const;
const recommended = (executable: string, args: ReadonlyArray<string>): RecommendedCommand => ({
  executable,
  args,
  shellRequired: false,
});

export const packageManagerCommand = (
  method: InstallMethodType,
  targetVersion: string,
  reinstall: boolean,
): RecommendedCommand | null => {
  switch (method._tag) {
    case "Homebrew":
      return recommended("brew", [reinstall ? "reinstall" : "upgrade", "agentxm/tap/axm"]);
    case "Npm":
      return recommended("npm", ["install", "-g", `${NPM_PACKAGE}@${targetVersion}`]);
    case "Pnpm":
      return recommended("pnpm", ["add", "-g", `${NPM_PACKAGE}@${targetVersion}`]);
    case "Yarn":
      return supportedMethod(method)
        ? recommended("yarn", ["global", "add", `${NPM_PACKAGE}@${targetVersion}`])
        : null;
    case "Script":
    case "Unknown":
      return null;
  }
};

export const packageAvailabilityCommand = (
  method: Extract<InstallMethodType, { readonly _tag: "Npm" | "Pnpm" | "Yarn" }>,
  targetVersion: string,
): RecommendedCommand => {
  const packageReference = `${NPM_PACKAGE}@${targetVersion}`;
  switch (method._tag) {
    case "Npm":
      return recommended("npm", ["view", packageReference, "version", "--json"]);
    case "Pnpm":
      return recommended("pnpm", ["view", packageReference, "version", "--json"]);
    case "Yarn":
      // Yarn Classic synthesizes the requested version even when it does not exist.
      // Its published version inventory establishes membership instead.
      return recommended("yarn", ["info", packageReference, "versions", "--json"]);
  }
};

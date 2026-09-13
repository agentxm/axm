import type {
  InstallerInstructionsService,
  RecommendedCommand,
} from "@agentxm/cli-maintenance/self-update/application";
import { packageManagerCommand } from "./package-installers/commands.js";

/** Native shell grammar is shared by assessment and execution through the owned contract. */
export const makeInstallerInstructions = (platform: string): InstallerInstructionsService => ({
  packageCommand: packageManagerCommand,
  recoveryCommand: (targetVersion): RecommendedCommand =>
    platform === "win32"
      ? {
          executable: "powershell",
          args: [
            "-Command",
            `$env:AXM_INSTALL_VERSION='${targetVersion}'; irm https://axm.sh/install.ps1 | iex`,
          ],
          shellRequired: true,
        }
      : {
          executable: "sh",
          args: [
            "-c",
            `curl -fsSL https://axm.sh/install.sh | AXM_INSTALL_VERSION=${targetVersion} sh`,
          ],
          shellRequired: true,
        },
});

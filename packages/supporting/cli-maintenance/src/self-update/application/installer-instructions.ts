import * as Context from "effect/Context";
import type { RecommendedCommand } from "./execution-result.js";
import type { PackageManagedInstallation } from "./package-installer.js";

/** Read-only installer grammar used to describe an action or recovery. */
export interface InstallerInstructionsService {
  readonly packageCommand: (
    method: PackageManagedInstallation,
    targetVersion: string,
    reinstall: boolean,
  ) => RecommendedCommand | null;
  readonly recoveryCommand: (targetVersion: string) => RecommendedCommand;
}

export class InstallerInstructions extends Context.Service<
  InstallerInstructions,
  InstallerInstructionsService
>()("@agentxm/cli-maintenance/self-update/InstallerInstructions") {}

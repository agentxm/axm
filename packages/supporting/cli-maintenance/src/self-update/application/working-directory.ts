/**
 * The directory an upgrade invocation runs in. Every recorded child command
 * runs there, so the installer sees the directory the user selected rather
 * than the process's own working directory.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

export interface UpgradeWorkingDirectoryService {
  readonly path: string;
}

export class UpgradeWorkingDirectory extends ServiceMap.Service<
  UpgradeWorkingDirectory,
  UpgradeWorkingDirectoryService
>()("@agentxm/cli-maintenance/self-update/UpgradeWorkingDirectory") {}

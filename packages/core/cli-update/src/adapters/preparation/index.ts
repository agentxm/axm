import * as Effect from "effect/Effect";
import type { InstallationInspectionService } from "@agentxm/cli-maintenance/self-update/application";
import type { InstallMethodService } from "../../install-method/install-method.js";
import type { makeCommandRunner } from "../subprocess/command-evidence.js";
import { inspectPackageManagerOwnership } from "./ownership.js";

/** Adapt host probes to immutable installation facts. */
export const makeInstallationInspection = (
  installMethod: InstallMethodService,
  run: ReturnType<typeof makeCommandRunner>,
): InstallationInspectionService => ({
  platform: process.platform,
  architecture: process.arch,
  inspect: (workingDirectory) =>
    installMethod
      .detect()
      .pipe(
        Effect.flatMap((method) => inspectPackageManagerOwnership(method, run, workingDirectory)),
      ),
});

import { methodLabel } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import * as Effect from "effect/Effect";
import {
  UpgradeWorkingDirectory,
  type CliReleaseCatalogService,
  type CommandRecord,
  type InstallationInspectionService,
  type InspectedInstallation,
  type SelectedRelease,
} from "@agentxm/cli-maintenance/self-update/application";
import { observeUnit } from "@agentxm/workspace-operations";
import type { InstallMethodService } from "../../install-method/install-method.js";
import { Subprocess, type SubprocessService } from "../../subprocess/subprocess.js";
import { methodName } from "@agentxm/cli-maintenance/self-update/domain";
import { resolveAmbiguousPackageManager } from "../../upgrade/mechanism.js";

/** Adapt host probes to immutable installation facts and the CLI operation stream. */
export const makeInstallationInspection = (
  installMethod: InstallMethodService,
  subprocess: SubprocessService,
): InstallationInspectionService => ({
  platform: process.platform,
  architecture: process.arch,
  inspect: (workingDirectory) =>
    observeUnit(
      {
        id: "detect-install-method",
        label: "AXM installation method",
        resolvedLabel: (result: InspectedInstallation) =>
          result.method._tag === "Unknown"
            ? "AXM installation method — undetermined"
            : `AXM installed with ${methodLabel(methodName(result.method))}`,
      },
      Effect.gen(function* () {
        const commands: Array<CommandRecord> = [];
        const detected = yield* installMethod.detect();
        const method = yield* resolveAmbiguousPackageManager(detected, commands);
        return { method, commands } satisfies InspectedInstallation;
      }).pipe(
        Effect.provideService(Subprocess, subprocess),
        Effect.provideService(UpgradeWorkingDirectory, { path: workingDirectory }),
      ),
    ),
});

/** Adapt release-catalog calls to the CLI operation stream. */
export const observeReleaseCatalog = (
  catalog: CliReleaseCatalogService,
): CliReleaseCatalogService => ({
  stable: (binaryName) =>
    observeUnit(
      {
        id: "resolve-channel",
        label: "AXM stable channel",
        resolvedLabel: (selected: SelectedRelease) =>
          `AXM stable channel — ${selected.targetVersion}`,
      },
      catalog.stable(binaryName),
    ),
  exact: (version, binaryName) =>
    observeUnit(
      { id: "resolve-version", label: `AXM ${version}` },
      catalog.exact(version, binaryName),
    ),
});

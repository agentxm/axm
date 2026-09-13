import { methodLabel } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import * as Effect from "effect/Effect";
import {
  type CliReleaseCatalogService,
  type InstallationInspectionService,
  type InspectedInstallation,
  type SelectedRelease,
} from "@agentxm/cli-maintenance/self-update/application";
import { observeUnit } from "@agentxm/workspace-operations";
import type { InstallMethodService } from "../../install-method/install-method.js";
import { methodName } from "@agentxm/cli-maintenance/self-update/domain";
import type { makeCommandRunner } from "../subprocess/command-evidence.js";
import { inspectPackageManagerOwnership } from "./ownership.js";

/** Adapt host probes to immutable installation facts and the CLI operation stream. */
export const makeInstallationInspection = (
  installMethod: InstallMethodService,
  run: ReturnType<typeof makeCommandRunner>,
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
      installMethod
        .detect()
        .pipe(
          Effect.flatMap((method) => inspectPackageManagerOwnership(method, run, workingDirectory)),
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

import * as Effect from "effect/Effect";
import { classifyVersionRelation, normalizeExactVersion } from "../domain/index.js";
import { UpgradeFailed } from "./errors.js";
import { CliReleaseCatalog, type VersionResolutionResult } from "./releases.js";

export interface UpgradeReleaseRequest {
  readonly requestedVersion?: string | undefined;
  readonly localVersion: string | null;
  readonly binaryName: string;
}

/** Select the requested authority, then compare its release with the installation. */
export const selectUpgradeRelease: (
  request: UpgradeReleaseRequest,
) => Effect.Effect<VersionResolutionResult, UpgradeFailed, CliReleaseCatalog> = Effect.fn(
  "SelfUpdate.selectUpgradeRelease",
)(function* (request: UpgradeReleaseRequest) {
  const requestedVersion = request.requestedVersion;
  if (requestedVersion !== undefined && normalizeExactVersion(requestedVersion) === null) {
    return yield* new UpgradeFailed({
      category: "validation",
      detail: `Invalid exact CLI version: ${requestedVersion}`,
      suggestions: [{ description: "Use a stable semantic version without a leading v." }],
    });
  }

  const catalog = yield* CliReleaseCatalog;
  const selected =
    requestedVersion === undefined
      ? yield* catalog.stable(request.binaryName)
      : yield* catalog.exact(requestedVersion, request.binaryName);

  if (normalizeExactVersion(selected.targetVersion) === null) {
    return yield* new UpgradeFailed({
      category: "validation",
      detail: "The selected upgrade target is not valid semantic version",
    });
  }

  if (requestedVersion !== undefined && selected.targetVersion !== requestedVersion) {
    return yield* new UpgradeFailed({
      category: "validation",
      detail: "The release catalog did not return the requested exact CLI version",
    });
  }

  return {
    ...selected,
    ...classifyVersionRelation(request.localVersion, selected.targetVersion),
  };
});

/** Self-update application contracts and release-selection workflow. */
export { UpgradeFailed } from "./errors.js";
export {
  CliReleaseCatalog,
  type CliReleaseCatalogService,
  type ResolvedRelease,
  type SelectedRelease,
  type VersionResolutionResult,
} from "./releases.js";
export { selectUpgradeRelease, type UpgradeReleaseRequest } from "./release-selection.js";

/**
 * Extension-lifecycle feature: install, update, uninstall, enable, and
 * disable policy across root and type-specific command forms — configured
 * entry resolution, and the install, update, uninstall, unpack, and demote use
 * cases every command spelling routes through. The per-type planners belong
 * to each extension kind.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Activation: separate enable and disable entries over shared settlement.
export { resolveRootActivationIntent } from "./activation/root-intent.js";
export {
  EnableExtension,
  DisableExtension,
  type ActivationUnchanged,
  type ActivationCandidate,
  type ActivationFailure,
  type EnableExtensionRequest,
} from "./activation/set-activation.js";

// Install: acquiring extensions from an explicit source or the bundled skill.
export {
  InstallExtensions,
  type InstallExtensionsCandidate,
  type InstallExtensionsRequest,
  type InstallExtensionsSelection,
  type InstallExtensionSelectors,
  type InstallSubject,
  installSelectorsFor,
} from "./install/install-extensions.js";
export { selectInstallRefs } from "./install/selection.js";
export { perTypeInstallPluralSegments } from "./install/per-type-install.js";

// Uninstall: withdrawing extensions, as one use case behind every spelling.
export { MigrateDeprecated } from "./migrate-deprecated.js";
export {
  UninstallExtensions,
  type UninstallExtensionsRequest,
} from "./uninstall/uninstall-extensions.js";
export { resolveRootUninstallIntent } from "./uninstall/root-intent.js";

// Update: the atomicity a workspace-wide sweep declares.
export { WORKSPACE_UPDATE_ATOMICITY } from "./update/atomicity.js";

// Update: advancing what the workspace already accepted, for a named
// extension or for the configured entries as a whole.
export {
  UpdateExtensions,
  contextForResolution,
  type UpdateCandidate,
  type UpdateSubjectType,
} from "./update/update-extensions.js";
export { type ConfiguredUpdateSelector } from "./update/selector.js";
export { type WorkspaceUpdatableType } from "./update/configured.js";

// Unpack: promoting a Pack's members to direct declarations.
export { PromoteAuthoredPack } from "./unpack/promote-authored-pack.js";

// Demote: returning a workspace-authored package to an external source.
export { DemoteToExternalSource } from "./demote/demote-to-external-source.js";

export { HandoffSkills, type HandoffRequest } from "./handoff.js";

export type { InstalledSkill } from "./skill-acquisitions.js";

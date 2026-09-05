/**
 * Extension-authoring feature: new-extension scaffolding, fork, native
 * import, authored identity decoding, and authored pack membership. The
 * application supplies the failure adapter that serializes authoring
 * failures into the plan-step vocabulary.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { AuthoringFailed } from "./errors.js";
export {
  AuthoringFailureAdapter,
  withAdaptedStepFailures,
  type AuthoringFailureAdapterService,
} from "./failure-adapter.js";

export {
  decodeDesiredExtensionIdentity,
  type DecodedDesiredExtensionIdentity,
  type DesiredPackageAuthority,
} from "./desired-identity.js";

export { forkExtensionPackage, type ForkExtensionPackageArgs } from "./fork-package.js";
export {
  importNativeExtensionPackage,
  type ImportNativeExtensionPackageArgs,
  type NativeImportError,
} from "./import-native-package.js";

export { preflightCreateOnly, type CreateOnlyPreflightArgs } from "./create-preflight.js";

export { markerFqnForRef, type MarkerFqnRef } from "./marker-fqn.js";

// Scaffolding operations
export {
  newSkill,
  type NewSkillOperation,
  type NewSkillOperationArgs,
} from "./skills/new-skill.js";
export { newHook, type NewHookOperation, type NewHookOperationArgs } from "./hooks/new-hook.js";
export { newPack, type NewPackOperation, type NewPackOperationArgs } from "./packs/new-pack.js";

// Authored pack membership operations
export {
  addToPack,
  type AddToPackOperation,
  type AddToPackOperationArgs,
} from "./packs/add-to-pack.js";
export {
  removeFromPack,
  type RemoveFromPackOperation,
  type RemoveFromPackOperationArgs,
} from "./packs/remove-from-pack.js";

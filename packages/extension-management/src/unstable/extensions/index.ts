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

// FQN parsing
export { fqnInvalidErrorToAppError } from "../app-error/conversions.js";

export { preflightCreateOnly, type CreateOnlyPreflightArgs } from "./create-preflight.js";

export { markerFqnForRef, type MarkerFqnRef } from "./marker-fqn.js";

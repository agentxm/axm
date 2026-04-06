/**
 * Extension pack ref types.
 *
 * Concrete extension pack refs built on top of the shared ref base hierarchy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  ExtensionPackRefBase,
  RegistryRefDetails,
  BuiltinRefDetails,
} from "../extensions/ref-base.js";
import type { RegistrySource, BuiltinSource } from "../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete Pack Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type RegistryExtensionPackRef = ExtensionPackRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type BuiltinExtensionPackRef = ExtensionPackRefBase<"builtin", BuiltinSource> &
  BuiltinRefDetails;

/** @experimental */
export type ExtensionPackRef = RegistryExtensionPackRef | BuiltinExtensionPackRef;

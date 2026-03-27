/**
 * Pack extension ref types.
 *
 * Concrete pack refs built on top of the shared ref base hierarchy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  PackExtensionRefBase,
  RegistryRefDetails,
  BuiltinRefDetails,
} from "../extensions/ref-base.js";
import type { RegistrySource, BuiltinSource } from "../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete Pack Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type RegistryPackRef = PackExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type BuiltinPackRef = PackExtensionRefBase<"builtin", BuiltinSource> & BuiltinRefDetails;

/** @experimental */
export type PackExtensionRef = RegistryPackRef | BuiltinPackRef;

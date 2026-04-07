/**
 * Extension pack ref types.
 *
 * Concrete extension pack refs built on top of the shared ref base hierarchy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionPackRefBase, RegistryRefDetails } from "../extensions/ref-base.js";
import type { RegistrySource } from "../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete Pack Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type RegistryExtensionPackRef = ExtensionPackRefBase<"registry", RegistrySource> &
  RegistryRefDetails;

/** @experimental */
export type ExtensionPackRef = RegistryExtensionPackRef;

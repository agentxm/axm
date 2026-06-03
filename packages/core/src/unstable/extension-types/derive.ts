/**
 * Derivation helpers for the extension type catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { EXTENSION_TYPES_BY_ID } from "./catalog.js";
import type { ExtensionTypeDefinition, LeafExtensionType, Standard } from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export const getExtensionTypeDefinition = (id: LeafExtensionType): ExtensionTypeDefinition =>
  EXTENSION_TYPES_BY_ID[id];

/** @experimental This API is unstable and may change without notice. */
export const getStandardForExtensionType = (id: LeafExtensionType): Standard | null =>
  getExtensionTypeDefinition(id).standard;

/** @experimental This API is unstable and may change without notice. */
export const isSpecTracked = (id: LeafExtensionType): boolean =>
  getStandardForExtensionType(id) !== null;

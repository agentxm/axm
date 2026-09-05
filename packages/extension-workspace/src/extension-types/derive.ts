/**
 * Derivation helpers for the extension type catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { EXTENSION_TYPES_BY_ID } from "./catalog.js";
import type {
  CatalogExtensionType,
  ExtensionTypeDefinition,
  Standard,
} from "@agentxm/extension-model/unstable/extension-types/schema";

/** @experimental This API is unstable and may change without notice. */
export const getExtensionTypeDefinition = (id: CatalogExtensionType): ExtensionTypeDefinition =>
  EXTENSION_TYPES_BY_ID[id];

/** @experimental This API is unstable and may change without notice. */
export const getStandardForExtensionType = (id: CatalogExtensionType): Standard | null =>
  getExtensionTypeDefinition(id).standard;

/** @experimental This API is unstable and may change without notice. */
export const isSpecTracked = (id: CatalogExtensionType): boolean =>
  getStandardForExtensionType(id) !== null;

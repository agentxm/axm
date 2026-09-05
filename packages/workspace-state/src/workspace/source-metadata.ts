/** Source metadata derivation helpers. */

import type { PackagingKind } from "./read-model-record-types.js";

export type SourceMeta = { readonly packagingKind: PackagingKind };

export const deriveSourceMetaFromLockType = (lockType: string): SourceMeta => {
  switch (lockType) {
    case "registry":
      return { packagingKind: "native" };
    default:
      return { packagingKind: "non-native" };
  }
};

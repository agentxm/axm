import { computePackageContentHash } from "../../extensions/package-hash.js";

// Source hashes are advisory change markers. Reusing the package-content
// algorithm gives every relative path and byte sequence an unambiguous NUL-
// separated representation.
export const computeSkillSourceHash = computePackageContentHash;

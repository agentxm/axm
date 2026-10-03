import { computePackageContentHash } from "@agentxm/workspace-kernel/workspace-state";

// Source hashes are advisory change markers. Reusing the package-content
// algorithm frames paths, entry kinds, executable bits, bytes, and link text
// without following symbolic links.
export const computeSkillSourceHash = computePackageContentHash;

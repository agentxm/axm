/**
 * Git operations module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { findGitRoot, isGitManaged } from "./detect.js";
export { getCommitSha, getTreeSha, shallowClone } from "./operations.js";

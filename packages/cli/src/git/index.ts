/**
 * Git operations module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { GitError } from "./errors.js";
export {
  cloneRepo,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
  shallowClone,
} from "./operations.js";

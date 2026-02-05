/**
 * GitLab source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { GITLAB_HTTPS_PATTERN, GITLAB_SSH_PATTERN } from "./patterns.js";
export { parseGitLabHttpsUrl, parseGitLabSshUrl } from "./parser.js";

/**
 * GitHub source parsing and API operations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { GITHUB_HTTPS_PATTERN, GITHUB_SSH_PATTERN } from "./patterns.js";
export { fetchGitHubTreeHash, GitHubApiError } from "./api.js";
export { resolveRepo } from "./resolve-repo.js";
export { config } from "./config.js";
export { parseShorthand, printShorthand, shorthandPrefix } from "./shorthand.js";
export { parseUrl } from "./url.js";
export { parseScp } from "./scp.js";

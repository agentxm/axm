/**
 * GitHub URL patterns for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * GitHub HTTPS URL pattern.
 * Matches: https://github.com/owner/repo[/tree/ref/path]
 */
export const GITHUB_HTTPS_PATTERN =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;

/**
 * GitHub SSH URL pattern.
 * Matches: git@github.com:owner/repo.git
 */
export const GITHUB_SSH_PATTERN = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

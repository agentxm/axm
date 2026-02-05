/**
 * GitLab URL patterns for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * GitLab HTTPS URL pattern.
 * Matches: https://gitlab.com/owner/repo[/-/tree/ref/path]
 */
export const GITLAB_HTTPS_PATTERN =
  /^https?:\/\/gitlab\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?$/;

/**
 * GitLab SSH URL pattern.
 * Matches: git@gitlab.com:owner/repo.git
 */
export const GITLAB_SSH_PATTERN = /^git@gitlab\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

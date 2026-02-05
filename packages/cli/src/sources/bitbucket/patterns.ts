/**
 * Bitbucket URL patterns for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * Bitbucket HTTPS URL pattern.
 * Matches: https://bitbucket.org/owner/repo[/src/ref/path]
 */
export const BITBUCKET_HTTPS_PATTERN =
  /^https?:\/\/bitbucket\.org\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/src\/([^/]+)(?:\/(.+))?)?$/;

/**
 * Bitbucket SSH URL pattern.
 * Matches: git@bitbucket.org:owner/repo.git
 */
export const BITBUCKET_SSH_PATTERN = /^git@bitbucket\.org:([^/]+)\/([^/]+?)(?:\.git)?$/;

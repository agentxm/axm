/**
 * Local path patterns for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * Local path pattern for recognizing local filesystem paths.
 * Matches: ./path, ../path, /path, ~/path, ~\path, or Windows paths like C:\path or C:/path
 */
export const LOCAL_PATH_PATTERN = /^(?:\.\.?\/|\/|~\/|~\\|[A-Za-z]:[\\/])/;

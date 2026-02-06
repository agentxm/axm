/**
 * Azure Repos URL patterns for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * Azure Repos HTTPS URL pattern.
 * Matches: https://dev.azure.com/{org}/{project}/_git/{repo}
 */
export const AZUREREPOS_HTTPS_PATTERN =
  /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;

/**
 * Azure Repos SSH URL pattern.
 * Matches: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
 */
export const AZUREREPOS_SSH_PATTERN =
  /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;

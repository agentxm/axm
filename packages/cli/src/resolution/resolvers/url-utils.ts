/**
 * Shared URL utilities for resolvers.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Build HTTPS URL from source type and owner/repo.
 */
export const buildOriginUrl = (
  sourceType: "github" | "gitlab" | "bitbucket" | "azure",
  owner: string,
  repo: string,
): string => {
  switch (sourceType) {
    case "github":
      return `https://github.com/${owner}/${repo}`;
    case "gitlab":
      return `https://gitlab.com/${owner}/${repo}`;
    case "bitbucket":
      return `https://bitbucket.org/${owner}/${repo}`;
    case "azure":
      // Azure DevOps URL format: https://dev.azure.com/{org}/{project}/_git/{repo}
      // For simplicity, treating owner as org/project combined
      return `https://dev.azure.com/${owner}/${repo}`;
  }
};

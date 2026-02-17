/**
 * Shared utility functions for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { GitHostingProviderSource, SourceInputLegacy } from "./types.js";

/**
 * Type guard for git hosting provider sources (GitHub, GitLab, Bitbucket).
 */
export const isGitHostingProviderSource = (
  source: SourceInputLegacy,
): source is GitHostingProviderSource =>
  source.type === "github" ||
  source.type === "gitlab" ||
  source.type === "bitbucket" ||
  source.type === "azurerepos";

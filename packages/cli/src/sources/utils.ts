/**
 * Shared utility functions for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { GitHostingProviderSource, SourceInput } from "./types.js";

/**
 * Type guard for git hosting provider sources (GitHub, GitLab, Bitbucket).
 */
export const isGitHostingProviderSource = (
  source: SourceInput,
): source is GitHostingProviderSource =>
  source.source === "github" || source.source === "gitlab" || source.source === "bitbucket";

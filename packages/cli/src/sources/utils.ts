/**
 * Shared utility functions for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { GitSource, Source } from "./types.js";

/**
 * Type guard for git hosting provider sources (GitHub, GitLab, Bitbucket).
 */
export const isGitSource = (source: Source): source is GitSource =>
  source.source === "github" || source.source === "gitlab" || source.source === "bitbucket";

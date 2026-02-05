/**
 * Shared utility functions for source parsing.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { GitSource, ParsedSource } from "./types.js";

/**
 * Type guard for git hosting provider sources (GitHub, GitLab, Bitbucket).
 */
export const isGitSource = (parsed: ParsedSource): parsed is GitSource =>
  parsed.source === "github" || parsed.source === "gitlab" || parsed.source === "bitbucket";

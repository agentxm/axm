/**
 * Error formatting utilities for CLI handlers.
 *
 * Provides consistent error message formatting with what happened,
 * optional details, and optional recovery guidance.
 */

/**
 * Formats an error message with what happened and how to fix.
 *
 * Output format:
 * ```
 * X Could not find configuration file
 *   Looked for: .axm/settings.json
 *   Run 'axm init' to create one.
 * ```
 *
 * @param what - What went wrong (the error message)
 * @param details - Optional array of detail lines (context, what was tried, etc.)
 * @param howToFix - Optional recovery guidance
 * @returns Formatted error string
 *
 * @example
 * formatError("Could not find configuration file")
 * // => "X Could not find configuration file"
 *
 * @example
 * formatError(
 *   "Could not find configuration file",
 *   ["Looked for: .axm/settings.json"],
 *   "Run 'axm init' to create one."
 * )
 * // => "X Could not find configuration file\n  Looked for: .axm/settings.json\n  Run 'axm init' to create one."
 */
export function formatError(
  what: string,
  details?: ReadonlyArray<string>,
  howToFix?: string,
): string {
  const lines: string[] = [];

  // Main error line with X marker
  lines.push(`\u2717 ${what}`);

  // Add details (indented)
  if (details && details.length > 0) {
    for (const detail of details) {
      lines.push(`  ${detail}`);
    }
  }

  // Add recovery guidance (indented)
  if (howToFix) {
    lines.push(`  ${howToFix}`);
  }

  return lines.join("\n");
}

/**
 * Formats an error for when extension resolution returns no results.
 *
 * Provides guidance on valid input formats for extension resolution.
 *
 * @param input - The input string that failed to resolve
 * @returns Formatted error string with format suggestions
 *
 * @example
 * formatEmptyResolutionError("my-skill")
 * // => "✗ Could not resolve \"my-skill\"\n  No matching extensions found\n  Try one of these formats:..."
 */
export function formatEmptyResolutionError(input: string): string {
  return formatError(
    `Could not resolve "${input}"`,
    ["No matching extensions found"],
    [
      "Try one of these formats:",
      "  • Local path: ./path/to/skill or /absolute/path",
      "  • GitHub: github:owner/repo or owner/repo",
      "  • GitLab: gitlab:owner/repo",
      "  • AXM name: @scope/name (if installed)",
    ].join("\n"),
  );
}

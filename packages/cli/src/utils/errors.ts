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
export function formatError(what: string, details?: string[], howToFix?: string): string {
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

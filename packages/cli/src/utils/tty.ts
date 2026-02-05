/**
 * TTY detection utilities for CLI handlers.
 */

/**
 * Returns true if stdin is a TTY, meaning the user can provide
 * interactive input (respond to prompts, make selections, etc.).
 *
 * Use this before calling interactive prompt functions.
 * When false and --yes/--non-interactive is not set, fail with a helpful error.
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

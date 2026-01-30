/**
 * TTY detection utilities for CLI handlers.
 *
 * These functions help handlers determine whether they can use
 * interactive prompts and fancy output (spinners, colors, etc.).
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

/**
 * Returns true if stdout is a TTY, meaning we can use fancy output
 * like spinners, colors, and progress bars.
 *
 * Use this before using spinners or other TTY-dependent output.
 * When false, use plain text logging instead.
 */
export function isFancyOutput(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * Shared yargs configuration helpers for subcommand groups.
 */

/**
 * Standard .fail() handler for subcommand groups.
 *
 * Shows help and exits cleanly (code 0) when no subcommand is provided.
 * Prints errors and exits with code 1 for other failures.
 */
export const subcommandFailHandler = (
  msg: string | undefined,
  _err: Error | undefined,
  yargs: { showHelp: (fn: string) => void },
): void => {
  if (msg?.includes("Not enough non-option arguments")) {
    yargs.showHelp("log");
    process.exit(0);
  }
  console.error(msg ?? _err);
  process.exit(1);
};

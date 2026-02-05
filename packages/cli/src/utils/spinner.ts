/**
 * Spinner utility for CLI handlers.
 *
 * Clack automatically handles non-TTY scenarios gracefully.
 */

import * as p from "@clack/prompts";

/**
 * Interface for a spinner helper.
 */
export interface SpinnerHelper {
  /** Starts the spinner with a message. */
  start(message: string): void;
  /** Stops the spinner with a completion message. */
  stop(message: string): void;
}

/**
 * Creates a spinner helper using @clack/prompts.
 * Clack automatically handles non-TTY environments.
 */
export function createSpinnerHelper(): SpinnerHelper {
  const spinner = p.spinner();
  return {
    start: (message: string) => spinner.start(message),
    stop: (message: string) => spinner.stop(message),
  };
}

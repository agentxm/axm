/**
 * Spinner utility for CLI handlers.
 *
 * Provides a spinner helper that gracefully falls back to plain text logging
 * when the terminal doesn't support fancy output (e.g., CI environments).
 */

import * as p from "@clack/prompts";
import { isFancyOutput } from "./tty.js";

/**
 * Interface for a spinner helper that abstracts TTY-dependent output.
 */
export interface SpinnerHelper {
  /**
   * Starts the spinner with a message.
   * When fancy output is not available, logs the message as info.
   */
  start(message: string): void;

  /**
   * Stops the spinner with a completion message.
   * When fancy output is not available, logs the message as info.
   */
  stop(message: string): void;
}

/**
 * Creates a spinner helper that uses @clack/prompts spinner when possible,
 * falling back to plain text logging when stdout is not a TTY.
 *
 * @returns A SpinnerHelper instance
 */
export function createSpinnerHelper(): SpinnerHelper {
  const useFancy = isFancyOutput();
  const spinner = useFancy ? p.spinner() : null;

  return {
    start: (message: string) => {
      if (spinner) {
        spinner.start(message);
      } else {
        p.log.info(message);
      }
    },
    stop: (message: string) => {
      if (spinner) {
        spinner.stop(message);
      } else {
        p.log.info(message);
      }
    },
  };
}

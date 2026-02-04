/**
 * Effect-wrapped prompt utilities for CLI handlers.
 *
 * Provides consistent prompting with cancel handling and error wrapping.
 * Uses @clack/prompts for the underlying UI.
 */

import * as p from "@clack/prompts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { isInteractive } from "./tty.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Asserts that a prompt result is not a cancel symbol.
 *
 * TypeScript doesn't narrow after `p.isCancel()` check, so this assertion
 * function bridges the gap after cancel has been handled.
 */
function assertNotCancel<T>(result: T | symbol): asserts result is T {
  if (typeof result === "symbol") {
    throw new Error("Unexpected cancel symbol after isCancel check");
  }
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Error that occurs during prompt operations.
 */
export class PromptError extends Data.TaggedError("PromptError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Option for select/multiselect prompts.
 */
export interface PromptOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Checks if interactive prompts can be used, accounting for flags.
 *
 * Returns false if:
 * - `yes` flag is set (auto-confirm)
 * - `nonInteractive` flag is set (no prompts)
 * - stdin is not a TTY (can't receive input)
 *
 * @param args - Object with optional yes/nonInteractive flags
 * @returns true if prompts can be used
 */
export function canPrompt(args: { yes?: boolean; nonInteractive?: boolean }): boolean {
  if (args.yes || args.nonInteractive) {
    return false;
  }
  return isInteractive();
}

// -----------------------------------------------------------------------------
// Prompt Functions
// -----------------------------------------------------------------------------

/**
 * Prompts for a yes/no confirmation.
 *
 * Handles cancel (Ctrl+C) by displaying a cancel message and exiting.
 *
 * @param message - The prompt message
 * @param initialValue - Initial value (defaults to true)
 * @returns Effect that succeeds with boolean or fails with PromptError
 */
export function promptConfirm(
  message: string,
  initialValue = true,
): Effect.Effect<boolean, PromptError> {
  return Effect.tryPromise({
    try: async () => {
      const result = await p.confirm({
        message,
        initialValue,
      });

      if (p.isCancel(result)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      return result;
    },
    catch: (error) =>
      new PromptError({
        message: "Failed to prompt for confirmation",
        cause: error,
      }),
  });
}

/**
 * Prompts for a single selection from a list.
 *
 * Handles cancel (Ctrl+C) by displaying a cancel message and exiting.
 *
 * @param message - The prompt message
 * @param items - Array of items to select from
 * @param toOption - Function to convert item to prompt option
 * @returns Effect that succeeds with selected item or fails with PromptError
 */
export function promptSelect<T>(
  message: string,
  items: readonly T[],
  toOption: (item: T) => PromptOption,
): Effect.Effect<T, PromptError> {
  return Effect.tryPromise({
    try: async () => {
      const options = items.map((item, index) => ({
        ...toOption(item),
        value: index,
      }));

      const result = await p.select({
        message,
        options,
      });

      if (p.isCancel(result)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      assertNotCancel(result);
      const selected = items[result];
      if (selected === undefined) {
        throw new Error("Invalid selection");
      }

      return selected;
    },
    catch: (error) =>
      new PromptError({
        message: "Failed to prompt for selection",
        cause: error,
      }),
  });
}

/**
 * Prompts for multiple selections from a list.
 *
 * Handles cancel (Ctrl+C) by displaying a cancel message and exiting.
 *
 * @param message - The prompt message
 * @param items - Array of items to select from
 * @param options - Configuration options
 * @returns Effect that succeeds with selected items or fails with PromptError
 */
export function promptMultiselect<T>(
  message: string,
  items: readonly T[],
  options: {
    toOption: (item: T) => PromptOption;
    initialValues?: string[];
    required?: boolean;
  },
): Effect.Effect<T[], PromptError> {
  return Effect.tryPromise({
    try: async () => {
      const promptOptions = items.map((item, index) => ({
        ...options.toOption(item),
        value: index,
      }));

      // Map initialValues (string values) to indices
      const initialIndices = options.initialValues
        ? items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => options.initialValues?.includes(options.toOption(item).value))
            .map(({ index }) => index)
        : undefined;

      // Build multiselect config, only including optional properties when defined
      const multiselectConfig: Parameters<typeof p.multiselect>[0] = {
        message,
        options: promptOptions,
      };
      if (initialIndices !== undefined) {
        multiselectConfig.initialValues = initialIndices;
      }
      if (options.required !== undefined) {
        multiselectConfig.required = options.required;
      }

      const result = await p.multiselect(multiselectConfig);

      if (p.isCancel(result)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      // Cast needed: multiselect config loses generic type info due to dynamic construction
      const indices = result as number[];
      return indices.map((index) => items[index]).filter((item): item is T => item !== undefined);
    },
    catch: (error) =>
      new PromptError({
        message: "Failed to prompt for multiselect",
        cause: error,
      }),
  });
}

// ---------------------------------------------------------------------------
// Terminal capability detection — determines what the output environment
// supports for renderer layer selection.
// ---------------------------------------------------------------------------

export interface TerminalCapabilities {
  /** Whether the terminal supports colors and box-drawing characters. */
  readonly canRender: boolean;
  /** Whether the terminal supports animated spinners and dynamic updates. */
  readonly isInteractive: boolean;
}

/**
 * Resolves terminal capabilities from the current process environment.
 *
 * - `canRender`: true when stdout is a TTY or FORCE_COLOR is set, and
 *   NO_COLOR is not set, and TERM is not "dumb".
 * - `isInteractive`: true when canRender is true and CI is not detected.
 */
export const resolveTerminalCapabilities = (): TerminalCapabilities => {
  const isTTY = process.stdout.isTTY === true;
  const forceColor = process.env["FORCE_COLOR"] !== undefined;
  const noColor = process.env["NO_COLOR"] !== undefined;
  const isDumb = process.env["TERM"] === "dumb";
  const ciEnv = process.env["CI"] === "true";

  const canRender = (isTTY || forceColor) && !noColor && !isDumb;
  const isInteractive = canRender && !ciEnv;

  return { canRender, isInteractive };
};

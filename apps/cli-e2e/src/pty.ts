/**
 * The axm artifact under a pseudo-terminal.
 *
 * `@agentxm/test-support/pty` runs any command under a real terminal; this
 * suite runs the artifact `cli-artifact.ts` selects, with the isolated home
 * and environment every other case gets.
 */

import {
  definedEntries,
  runUnderPty,
  type PtyRunOptions,
  type PtyRunResult,
} from "@agentxm/test-support/pty";

import { cliArtifact } from "./cli-artifact.js";

/**
 * Run the axm artifact under a pseudo-terminal with an isolated home, no CI
 * marker, and no colour, matching what the piped runner gives every other
 * case in this suite. The home and the workspace are both required: a command
 * that writes must not reach this repository because a caller left one out.
 */
export const runCliUnderPty = (
  args: ReadonlyArray<string>,
  options: PtyRunOptions & { readonly home: string; readonly cwd: string },
): Promise<PtyRunResult> => {
  const { home, env, ...rest } = options;
  // Bun warns when FORCE_COLOR and NO_COLOR are both present, and this suite
  // keeps NO_COLOR so a transcript assertion stays stable.
  const { FORCE_COLOR: _forceColor, ...parentEnv } = process.env;

  return runUnderPty(cliArtifact, args, {
    ...rest,
    env: {
      ...definedEntries(parentEnv),
      HOME: home,
      AXM_USER_HOME: home,
      // A prompt opens only when the invocation is interactive; the PTY
      // supplies the terminal and this clears an inherited CI marker.
      CI: "",
      NO_COLOR: "1",
      AXM_TELEMETRY: "0",
      TERM: "xterm-256color",
      ...env,
    },
  });
};

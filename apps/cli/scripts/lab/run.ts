/**
 * The CLI itself under a pseudo-terminal, from source, for looking at a whole
 * flow while it is being changed.
 *
 * The run gets an empty home and an empty workspace unless they are named, so
 * a command that writes cannot reach this repository or a real profile. It
 * replays a key-step script and prints the screen a person would see after
 * the last step, or after every step. It is a review aid, not evidence:
 * nothing asserts on it.
 */

import { fileURLToPath } from "node:url";

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { describeKeyStep, type KeyStep } from "@agentxm/test-support/key-steps";
import {
  definedEntries,
  ptyActionOf,
  ptyIsSupported,
  replayPtyRun,
  runUnderPty,
} from "@agentxm/test-support/pty";

import type { TerminalSize } from "../../src/screen/scene.js";

import { userError } from "./shared.js";

/** The source CLI launcher the repository's own `pnpm axm` runs. */
const sourceCli = {
  runtime: "bun-script",
  path: fileURLToPath(new URL("../../../../scripts/axm-local.ts", import.meta.url)),
} as const;

export interface RunOptions {
  readonly size: TerminalSize;
  readonly steps: ReadonlyArray<KeyStep>;
  readonly frames: boolean;
  readonly workspace: string | undefined;
  readonly home: string | undefined;
  readonly cliArguments: ReadonlyArray<string>;
}

/** Run the source CLI under a pseudo-terminal and print what it showed. */
export const runUnderTerminal = (options: RunOptions) =>
  Effect.gen(function* () {
    if (!ptyIsSupported)
      return yield* userError(`No pseudo-terminal is available on ${process.platform}.`);
    if (options.cliArguments.length === 0)
      return yield* userError(
        "Name the axm arguments to run after `--`, such as `lab run -- list`.",
      );
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = options.home ?? (yield* fs.makeTempDirectoryScoped({ prefix: "axm-lab-home-" }));
    const workspace =
      options.workspace ?? (yield* fs.makeTempDirectoryScoped({ prefix: "axm-lab-workspace-" }));
    // Bun warns when FORCE_COLOR and NO_COLOR are both present.
    const { FORCE_COLOR: _forceColor, ...parentEnv } = process.env;
    const result = yield* Effect.tryPromise(() =>
      runUnderPty(sourceCli, options.cliArguments, {
        columns: options.size.columns,
        rows: options.size.rows,
        cwd: path.resolve(workspace),
        actions: options.steps.map(ptyActionOf),
        // A run is read at its last step; it does not wait for the command to end.
        exitTimeout: 1_000,
        env: {
          ...definedEntries(parentEnv),
          HOME: path.resolve(home),
          AXM_USER_HOME: path.resolve(home),
          CI: "",
          NO_COLOR: "1",
          AXM_TELEMETRY: "0",
          TERM: "xterm-256color",
        },
      }),
    );
    const frames = yield* replayPtyRun(result, options.size.columns, options.size.rows);
    if (options.frames) {
      // Each step is one action, and the driver stops at the first wait that
      // is never shown, so the frames cover the steps up to that one.
      for (const [index, step] of options.steps.slice(0, frames.afterActions.length).entries()) {
        yield* Console.log(`── after ${describeKeyStep(step)}`);
        yield* Console.log(frames.afterActions[index] ?? "");
        yield* Console.log("");
      }
    } else {
      yield* Console.log(frames.afterActions.at(-1) ?? frames.final);
    }
    const unmatched = result.actions.findIndex((step) => !step.matched);
    const neverShown = options.steps[unmatched];
    if (neverShown !== undefined)
      return yield* userError(`Never shown: ${describeKeyStep(neverShown)}`);
  }).pipe(Effect.scoped);

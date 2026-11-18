/**
 * Show what the source CLI paints in a real terminal, for review while
 * changing it.
 *
 * Usage:
 *   bun src/pty-preview.ts [--size <columns>x<rows>] [--steps <script>] [--frames]
 *                          [--workspace <dir>] [--home <dir>] -- <axm arguments>
 *
 * The gallery paints every state a prompt can hold from pure functions; this
 * runs the CLI itself from source under a pseudo-terminal of the given size,
 * replays a step script against it, and prints the screen a person would see
 * after the last step — or after every step with `--frames`. Steps follow the
 * shared grammar in `@agentxm/test-support/key-steps`: `await:<text>`,
 * `type:<text>`, `size:<columns>x<rows>`, and keys by name such as `down*3` or
 * `space`.
 *
 * The run gets an empty home and an empty workspace unless they are named, so
 * a command that writes cannot reach this repository or a real profile.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import {
  describeKeyStep,
  parseKeySteps,
  parseTerminalSize,
  type KeyStep,
} from "@agentxm/test-support/key-steps";

import { replayPtyRun, runUnderPty, type PtyAction } from "./pty.js";

interface PreviewOptions {
  readonly columns: number;
  readonly rows: number;
  readonly steps: ReadonlyArray<KeyStep>;
  readonly frames: boolean;
  readonly workspace: string | undefined;
  readonly home: string | undefined;
  readonly cliArguments: ReadonlyArray<string>;
}

const USAGE =
  "usage: preview [--size <columns>x<rows>] [--steps <script>] [--frames] [--workspace <dir>] [--home <dir>] -- <axm arguments>\n" +
  '  for example: --size 100x40 --steps "await:type to filter,down*2,space" -- skills install owner/repo --agent claude-code';

/** The options a command line names, or what is wrong with it. */
const parsePreviewArguments = (
  argv: ReadonlyArray<string>,
): Result.Result<PreviewOptions, string> => {
  const separator = argv.indexOf("--");
  if (separator < 0) return Result.fail("Name the axm arguments to run after `--`.");
  const cliArguments = argv.slice(separator + 1);
  if (cliArguments.length === 0) return Result.fail("Name the axm arguments to run after `--`.");
  let options: PreviewOptions = {
    columns: 100,
    rows: 30,
    steps: [],
    frames: false,
    workspace: undefined,
    home: undefined,
    cliArguments,
  };
  const flags = argv.slice(0, separator);
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--frames") {
      options = { ...options, frames: true };
      continue;
    }
    const value = flags[index + 1];
    index += 1;
    if (value === undefined) return Result.fail(`${String(flag)} takes a value.`);
    if (flag === "--size") {
      const size = parseTerminalSize(value);
      if (Option.isNone(size))
        return Result.fail("--size names a terminal as columns by rows, such as 100x40.");
      options = { ...options, ...size.value };
    } else if (flag === "--steps") {
      const steps = parseKeySteps(value);
      if (Result.isFailure(steps)) return Result.fail(steps.failure);
      options = { ...options, steps: steps.success };
    } else if (flag === "--workspace") {
      options = { ...options, workspace: path.resolve(value) };
    } else if (flag === "--home") {
      options = { ...options, home: path.resolve(value) };
    } else {
      return Result.fail(`Unknown option ${String(flag)}.`);
    }
  }
  return Result.succeed(options);
};

const sourceCli = {
  runtime: "bun-script",
  path: fileURLToPath(new URL("../../../scripts/axm-local.ts", import.meta.url)),
} as const;

const definedEntries = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
  );

/** The pseudo-terminal action one step takes: its wait, the bytes its key sends, or its resize. */
const ptyAction = (step: KeyStep): PtyAction => {
  switch (step._tag) {
    case "Await":
      return { awaiting: step.text };
    case "Press":
      return { send: step.key.sequence };
    case "Resize":
      return { resize: step.size };
  }
};

const preview = (options: PreviewOptions) =>
  Effect.gen(function* () {
    const scratch = (prefix: string) => mkdtempSync(path.join(tmpdir(), prefix));
    const home = options.home ?? scratch("axm-preview-home-");
    const workspace = options.workspace ?? scratch("axm-preview-workspace-");
    // Bun warns when FORCE_COLOR and NO_COLOR are both present.
    const { FORCE_COLOR: _forceColor, ...parentEnv } = process.env;
    const result = yield* Effect.tryPromise(() =>
      runUnderPty(sourceCli, options.cliArguments, {
        columns: options.columns,
        rows: options.rows,
        cwd: workspace,
        actions: options.steps.map(ptyAction),
        // A preview is read at its last step; it does not wait for the command to end.
        exitTimeout: 1_000,
        env: {
          ...definedEntries(parentEnv),
          HOME: home,
          AXM_USER_HOME: home,
          CI: "",
          NO_COLOR: "1",
          AXM_TELEMETRY: "0",
          TERM: "xterm-256color",
        },
      }),
    );
    const frames = yield* replayPtyRun(result, options.columns, options.rows);
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
    if (neverShown !== undefined) {
      yield* Console.error(`\nNever shown: ${describeKeyStep(neverShown)}`);
      return 1;
    }
    return 0;
  });

const parsed = parsePreviewArguments(process.argv.slice(2));
if (Result.isFailure(parsed)) {
  console.error(`${parsed.failure}\n${USAGE}`);
  process.exit(2);
}
// This file is the process entry: nothing imports it, and the effect it runs needs no services.
// eslint-disable-next-line no-restricted-syntax -- the sanctioned entry adapter for this script
process.exit(await Effect.runPromise(preview(parsed.success)));

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
 * after the last step — or after every step with `--frames`. Steps are
 * documented in `pty-steps.ts`: `await:<text>`, `type:<text>`,
 * `size:<columns>x<rows>`, and keys by name such as `down*3` or `space`.
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
import * as Result from "effect/Result";

import { runUnderPty, type PtyAction } from "./pty.js";
import { replayFrames } from "./pty-replay.js";
import { parseSteps } from "./pty-steps.js";

interface PreviewOptions {
  readonly columns: number;
  readonly rows: number;
  readonly actions: ReadonlyArray<PtyAction>;
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
    actions: [],
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
      const [columns, rows, ...rest] = value.split("x").map(Number);
      if (
        columns === undefined ||
        rows === undefined ||
        rest.length > 0 ||
        !Number.isInteger(columns) ||
        !Number.isInteger(rows) ||
        columns < 1 ||
        rows < 1
      )
        return Result.fail("--size names a terminal as columns by rows, such as 100x40.");
      options = { ...options, columns, rows };
    } else if (flag === "--steps") {
      const actions = parseSteps(value);
      if (Result.isFailure(actions)) return Result.fail(actions.failure);
      options = { ...options, actions: actions.success };
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

const describeAction = (action: PtyAction): string =>
  "awaiting" in action
    ? `await ${JSON.stringify(action.awaiting)}`
    : "resize" in action
      ? `size ${String(action.resize.columns)}x${String(action.resize.rows)}`
      : `send ${JSON.stringify(action.send)}`;

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
        actions: options.actions,
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
    const frames = yield* Effect.tryPromise(() =>
      replayFrames(result, options.columns, options.rows),
    );
    const shown = (frame: string): string => frame.replace(/\s+$/u, "");
    if (options.frames) {
      for (const [index, step] of result.actions.entries()) {
        yield* Console.log(`── after ${describeAction(step.action)}`);
        yield* Console.log(shown(frames.afterActions[index] ?? ""));
        yield* Console.log("");
      }
    } else {
      yield* Console.log(shown(frames.afterActions.at(-1) ?? frames.final));
    }
    const unmatched = result.actions.find((step) => !step.matched);
    if (unmatched !== undefined) {
      yield* Console.error(`\nNever shown: ${describeAction(unmatched.action)}`);
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

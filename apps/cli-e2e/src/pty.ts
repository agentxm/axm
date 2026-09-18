/**
 * Pseudo-terminal harness for the E2E suite.
 *
 * Application-owned prompts and waits only exist when stdin is a terminal:
 * raw mode, key decoding, and the cleanup that follows an interrupt are the
 * parts no unit test reaches. This harness runs a command under a real PTY of
 * a declared size, replays a script of waits and key writes against it, and
 * reports what the terminal emitted together with the two process-level facts
 * the design depends on — that raw mode was handed back and the cursor was
 * left visible.
 *
 * The PTY itself is Bun's (`Bun.Terminal`), the one pseudo-terminal in this
 * repository's toolchain and available only inside the Bun runtime, while
 * Vitest runs under Node. `pty-driver.ts` is therefore spawned under Bun for
 * each run and speaks one JSON request and one JSON result over its own pipes;
 * everything the subject writes goes to the PTY instead.
 *
 * What comes back is a transcript, not an emulated screen grid: prompts
 * repaint their whole block, so the frame a key produced is the output that
 * followed it, reported per action as `emitted`.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as Schema from "effect/Schema";

import { cliArtifact } from "./cli-artifact.js";

/** Key sequences a terminal sends; the values are what a test writes. */
export const Keys = {
  up: "\u001B[A",
  down: "\u001B[B",
  right: "\u001B[C",
  left: "\u001B[D",
  space: " ",
  enter: "\r",
  tab: "\t",
  backspace: "\u007F",
  escape: "\u001B",
  /** Ctrl-C. Raw mode suppresses SIGINT, so this arrives as a byte. */
  interrupt: "\u0003",
} as const;

/** Wait until the visible transcript contains `awaiting`. */
const PtyAwaitSchema = Schema.Struct({ awaiting: Schema.String });

/** Write `send` to the terminal, then let the subject's repaint settle. */
const PtySendSchema = Schema.Struct({ send: Schema.String });

const PtyActionSchema = Schema.Union([PtyAwaitSchema, PtySendSchema]);

const PtyActionOutcomeSchema = Schema.Struct({
  action: PtyActionSchema,
  /** Always true for a write; false when a wait ran out of time. */
  matched: Schema.Boolean,
  /** Transcript this action produced, with escape sequences removed. */
  emitted: Schema.String,
});

export type PtyAction = typeof PtyActionSchema.Type;
export type PtyActionOutcome = typeof PtyActionOutcomeSchema.Type;

export interface PtyRunOptions {
  readonly columns?: number;
  readonly rows?: number;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly actions?: ReadonlyArray<PtyAction>;
  /** Budget for one `awaiting` action. Default 30s. */
  readonly awaitTimeout?: number;
  /** Budget for the subject to exit after the last action. Default 15s. */
  readonly exitTimeout?: number;
}

export interface PtyRunResult {
  /** Null when the subject had to be killed for overrunning its budget. */
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  /** Everything the terminal emitted, escape sequences intact. */
  readonly output: string;
  /** The same output with escape sequences removed and newlines normalised. */
  readonly transcript: string;
  readonly actions: ReadonlyArray<PtyActionOutcome>;
  /** Whether the subject left canonical mode and echo back on the terminal. */
  readonly rawModeRestored: boolean;
  /** Whether the cursor was visible when the subject let go of the terminal. */
  readonly cursorRestored: boolean;
}

/** The wire contract between this module and the Bun driver. */
const PtyDriverRequestSchema = Schema.Struct({
  subject: Schema.Struct({
    runtime: Schema.Literals(["binary", "bun-script"] as const),
    path: Schema.String,
  }),
  args: Schema.Array(Schema.String),
  columns: Schema.Number,
  rows: Schema.Number,
  cwd: Schema.String,
  env: Schema.Record(Schema.String, Schema.String),
  actions: Schema.Array(PtyActionSchema),
  awaitTimeoutMs: Schema.Number,
  exitTimeoutMs: Schema.Number,
});

const PtyDriverResultSchema = Schema.Struct({
  exitCode: Schema.NullOr(Schema.Number),
  signal: Schema.NullOr(Schema.String),
  timedOut: Schema.Boolean,
  output: Schema.String,
  actions: Schema.Array(PtyActionOutcomeSchema),
  /** `c_lflag` read from the terminal once the subject had let go of it. */
  localFlags: Schema.Number,
});

export type PtyDriverRequest = typeof PtyDriverRequestSchema.Type;
export type PtyDriverResult = typeof PtyDriverResultSchema.Type;

export const decodePtyDriverRequest = Schema.decodeUnknownSync(PtyDriverRequestSchema);
const decodePtyDriverResult = Schema.decodeUnknownSync(PtyDriverResultSchema);

/**
 * Bun allocates a pseudo-terminal on POSIX only. The suite's Windows coverage
 * runs from its own config and its own files, so a Windows host skips rather
 * than fails.
 */
export const ptyIsSupported = process.platform === "darwin" || process.platform === "linux";

// termios `c_lflag` bits. ECHO agrees across the supported platforms; ICANON
// does not, so the two values are named rather than shared.
const ECHO = 0x8;
const ICANON = process.platform === "linux" ? 0x2 : 0x100;

// Enough of the escape grammar to reduce a terminal transcript to its visible
// text. The pattern is built from strings so no line of this file carries a
// control character of its own.
const ESCAPE_SEQUENCE = new RegExp(
  [
    // An OSC string, terminated by BEL or by ST.
    String.raw`\u001B\][\s\S]*?(?:\u0007|\u001B\\)`,
    // A CSI sequence: colour, cursor movement, erase, mode set.
    String.raw`\u001B\[[0-9;?]*[ -/]*[@-~]`,
    // A two-character escape.
    String.raw`\u001B[@-Z\\-_]`,
  ].join("|"),
  "g",
);

const HIDE_CURSOR = "\u001B[?25l";
const SHOW_CURSOR = "\u001B[?25h";

export const visibleText = (output: string): string =>
  output.replace(ESCAPE_SEQUENCE, "").replaceAll("\r\n", "\n");

const definedEntries = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

const driverPath = fileURLToPath(new URL("./pty-driver.ts", import.meta.url));

const runDriver = (request: PtyDriverRequest): Promise<PtyDriverResult> =>
  new Promise((resolve, reject) => {
    // The driver runs in the parent toolchain; only the subject's environment
    // is isolated, and it travels inside the request.
    const driver = spawn("bun", ["run", driverPath], { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    driver.stdout.setEncoding("utf8");
    driver.stderr.setEncoding("utf8");
    driver.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    driver.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    driver.on("error", reject);
    driver.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`The PTY driver exited with ${String(code)}.\n${stderr}`));
        return;
      }
      try {
        resolve(decodePtyDriverResult(JSON.parse(stdout)));
      } catch (cause) {
        reject(
          new Error(`The PTY driver did not report a result.\n${stdout}\n${stderr}`, { cause }),
        );
      }
    });

    driver.stdin.end(JSON.stringify(request));
  });

/** Run an arbitrary command under a pseudo-terminal. */
export const runUnderPty = async (
  subject: PtyDriverRequest["subject"],
  args: ReadonlyArray<string>,
  options: PtyRunOptions = {},
): Promise<PtyRunResult> => {
  if (!ptyIsSupported) throw new Error(`No pseudo-terminal is available on ${process.platform}.`);

  const driverResult = await runDriver({
    subject,
    args,
    columns: options.columns ?? 100,
    rows: options.rows ?? 30,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? {},
    actions: options.actions ?? [],
    awaitTimeoutMs: options.awaitTimeout ?? 30_000,
    exitTimeoutMs: options.exitTimeout ?? 15_000,
  });

  const { localFlags, output, ...reported } = driverResult;
  const hidden = output.lastIndexOf(HIDE_CURSOR);

  return {
    ...reported,
    output,
    transcript: visibleText(output),
    rawModeRestored: (localFlags & ICANON) !== 0 && (localFlags & ECHO) !== 0,
    cursorRestored: hidden === -1 || output.lastIndexOf(SHOW_CURSOR) > hidden,
  };
};

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

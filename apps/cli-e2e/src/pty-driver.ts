/// <reference types="bun" />
/**
 * Bun-side pseudo-terminal driver, spawned by `pty.ts`.
 *
 * `Bun.Terminal` is the repository toolchain's pseudo-terminal and exists only
 * inside the Bun runtime, while the E2E suite runs under Node. This module is
 * that bridge: it reads one request on stdin, replays it against a
 * PTY-attached subprocess, and writes one JSON result to stdout. Its own
 * stdout carries nothing else — everything the subject writes goes to the PTY.
 *
 * The terminal is read after the subject has let go of it, so `c_lflag`
 * reports the state the subject left behind rather than the state it ran in.
 */

import type { PtyActionOutcome, PtyDriverResult } from "./pty.js";
import { decodePtyDriverRequest, visibleText } from "./pty.js";

/** How long output must stop changing before a repaint counts as settled. */
const QUIET_MS = 150;
/** Ceiling on one settle, so a subject that keeps animating still proceeds. */
const SETTLE_CAP_MS = 2_000;
const POLL_MS = 25;

/** Budgets are intervals, so they read a monotonic clock. */
const monotonicMs = () => performance.now();

const request = decodePtyDriverRequest(await Bun.stdin.json());

const command =
  request.subject.runtime === "binary"
    ? [request.subject.path, ...request.args]
    : [process.execPath, "run", request.subject.path, ...request.args];

let output = "";
const decoder = new TextDecoder();

const terminal = new Bun.Terminal({
  cols: request.columns,
  rows: request.rows,
  data: (_terminal, bytes) => {
    output += decoder.decode(bytes, { stream: true });
  },
});

const subject = Bun.spawn({
  cmd: command,
  terminal,
  cwd: request.cwd,
  env: request.env,
});

let reported = 0;
let awaitedThrough = 0;
const takeEmitted = () => {
  const emitted = output.slice(reported);
  reported = output.length;
  return { emitted: visibleText(emitted), bytes: emitted };
};

const awaitText = async (text: string): Promise<boolean> => {
  const deadline = monotonicMs() + request.awaitTimeoutMs;
  while (monotonicMs() < deadline) {
    if (visibleText(output.slice(awaitedThrough)).includes(text)) {
      awaitedThrough = output.length;
      return true;
    }
    // A subject that has already gone will never print it. Give its last
    // bytes time to arrive, then stop rather than spend the whole budget.
    if (subject.exitCode !== null || subject.signalCode !== null) {
      await Bun.sleep(QUIET_MS);
      const matched = visibleText(output.slice(awaitedThrough)).includes(text);
      if (matched) awaitedThrough = output.length;
      return matched;
    }
    await Bun.sleep(POLL_MS);
  }
  return false;
};

const settle = async (): Promise<void> => {
  const cap = monotonicMs() + SETTLE_CAP_MS;
  let seen = output.length;
  let quietUntil = monotonicMs() + QUIET_MS;
  while (monotonicMs() < cap && monotonicMs() < quietUntil) {
    await Bun.sleep(POLL_MS);
    if (output.length !== seen) {
      seen = output.length;
      quietUntil = monotonicMs() + QUIET_MS;
    }
  }
};

const actions: Array<PtyActionOutcome> = [];
for (const action of request.actions) {
  if ("awaiting" in action) {
    const matched = await awaitText(action.awaiting);
    // The awaited text can land before the frame it belongs to finishes
    // painting: a prompt writes its question, then its rows. Capturing on the
    // match alone yields a half-drawn frame whenever the subject is slow
    // enough to split them across chunks, so wait for the output to go quiet
    // first, exactly as a `send` action does.
    if (matched) await settle();
    actions.push({ action, matched, ...takeEmitted() });
    if (!matched) break;
    continue;
  }
  if ("resize" in action) {
    terminal.resize(action.resize.columns, action.resize.rows);
    // This directly spawned child has no shell establishing a foreground
    // process group. Deliver the notification a terminal host normally sends.
    if (subject.exitCode === null && subject.signalCode === null) subject.kill("SIGWINCH");
  } else terminal.write(action.send);
  await settle();
  actions.push({ action, matched: true, ...takeEmitted() });
}

const exitCode = await Promise.race([
  subject.exited,
  Bun.sleep(request.exitTimeoutMs).then(() => undefined),
]);
const timedOut = exitCode === undefined;
if (timedOut) subject.kill("SIGKILL");

// Let the last bytes and the subject's own teardown land before the terminal
// is asked what state it was left in.
await Bun.sleep(100);

const result: PtyDriverResult = {
  exitCode: exitCode ?? null,
  signal: subject.signalCode,
  timedOut,
  output,
  actions,
  localFlags: terminal.localFlags,
};

terminal.close();
await Bun.write(Bun.stdout, JSON.stringify(result));
process.exit(0);

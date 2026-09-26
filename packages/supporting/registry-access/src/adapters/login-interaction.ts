/**
 * Auth login interaction service.
 *
 * Best-effort platform integration for browser launch and clipboard copy.
 * Provides both the CLI-specific AuthLoginInteraction and the core
 * DeviceLoginInteraction service (used by core's runDeviceLogin).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import type { ChildProcessSpawner as ChildProcessSpawnerService } from "effect/unstable/process/ChildProcessSpawner";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import {
  DeviceLoginInteraction,
  type DeviceLoginInteractionService,
} from "../authentication/device-login.js";
import { envOption, isSSH } from "./environment.js";

interface CommandInvocation {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly stdinText?: string;
}

export interface AuthLoginInteractionService {
  readonly openBrowser: (url: string) => Effect.Effect<boolean>;
  readonly copyToClipboard: (text: string) => Effect.Effect<boolean>;
}

export class AuthLoginInteraction extends ServiceMap.Service<
  AuthLoginInteraction,
  AuthLoginInteractionService
>()("@agentxm/registry-access/login-interaction/AuthLoginInteraction") {}

/**
 * Best-effort command execution: `true` only when the process exits with code
 * 0; every failure (spawn, stdin write, signal termination) collapses to
 * `false`.
 *
 * The previous `node:child_process` implementation passed `windowsHide: true`;
 * `ChildProcess.CommandOptions` has no equivalent, so a transient console
 * window may appear on Windows.
 */
const runCommand = (
  spawner: ChildProcessSpawnerService["Service"],
  invocation: CommandInvocation,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const handle = yield* spawner.spawn(
      ChildProcess.make(invocation.command, invocation.args, {
        // Browser and clipboard helpers have no cwd-dependent behavior. Core
        // deliberately does not depend on the CLI execution-directory service.
        stdin: invocation.stdinText === undefined ? "ignore" : "pipe",
        stdout: "ignore",
        stderr: "ignore",
      }),
    );
    if (invocation.stdinText !== undefined) {
      // Write the payload, then close stdin (the handle's sink ends the pipe
      // when the stream completes) so clipboard commands finish reading.
      yield* Stream.run(Stream.make(new TextEncoder().encode(invocation.stdinText)), handle.stdin);
    }
    return (yield* handle.exitCode) === 0;
  }).pipe(
    Effect.scoped,
    Effect.catch(() => Effect.succeed(false)),
  );

const tryCommands = (
  spawner: ChildProcessSpawnerService["Service"],
  invocations: ReadonlyArray<CommandInvocation>,
) =>
  Effect.gen(function* () {
    for (const invocation of invocations) {
      const succeeded = yield* runCommand(spawner, invocation);
      if (succeeded) {
        return true;
      }
    }

    return false;
  });

export const browserCommands = (
  url: string,
  platform: NodeJS.Platform = process.platform,
): ReadonlyArray<CommandInvocation> => {
  switch (platform) {
    case "darwin":
      return [{ command: "open", args: [url] }];
    case "win32":
      return [
        {
          command: "rundll32",
          args: ["url.dll,FileProtocolHandler", url],
        },
      ];
    default:
      return [{ command: "xdg-open", args: [url] }];
  }
};

const clipboardCommands = (text: string): ReadonlyArray<CommandInvocation> => {
  switch (process.platform) {
    case "darwin":
      return [{ command: "pbcopy", args: [], stdinText: text }];
    case "win32":
      return [{ command: "clip", args: [], stdinText: text }];
    default:
      return [
        { command: "wl-copy", args: [], stdinText: text },
        { command: "xclip", args: ["-selection", "clipboard"], stdinText: text },
        { command: "xsel", args: ["--clipboard", "--input"], stdinText: text },
      ];
  }
};

/** The terminal multiplexer between AXM and the terminal a person types on, if any. */
type TerminalMultiplexer = "tmux" | "screen";

const ESC = "\u001b";

/**
 * The OSC 52 sequence that asks the terminal emulator to put `text` on its
 * own clipboard. Inside a multiplexer the sequence is wrapped in the
 * multiplexer's DCS passthrough, which forwards it to the outer terminal when
 * the multiplexer allows passthrough (tmux `allow-passthrough`); that forward
 * is best-effort.
 */
export const osc52Sequence = (text: string, multiplexer?: TerminalMultiplexer): string => {
  const osc52 = `${ESC}]52;c;${Encoding.encodeBase64(text)}\u0007`;
  switch (multiplexer) {
    case "tmux":
      return `${ESC}Ptmux;${osc52.replaceAll(ESC, `${ESC}${ESC}`)}${ESC}\\`;
    case "screen":
      return `${ESC}P${osc52}${ESC}\\`;
    case undefined:
      return osc52;
  }
};

const terminalMultiplexer = Effect.map(
  Effect.all([envOption("TMUX"), envOption("STY")]),
  ([tmux, sty]): TerminalMultiplexer | undefined =>
    Option.isSome(tmux) ? "tmux" : Option.isSome(sty) ? "screen" : undefined,
);

/**
 * Copy through the terminal itself, so over SSH the text lands on the
 * clipboard of the machine the person types on rather than the remote host's.
 * The terminal acknowledges nothing, so a sequence written to a terminal
 * counts as copied; with no terminal on stdout there is nowhere to send it.
 */
const copyThroughTerminal = (stdio: Stdio.Stdio, text: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (!(yield* stdio.stdoutIsTerminal)) return false;
    const multiplexer = yield* terminalMultiplexer;
    yield* Stream.run(Stream.make(osc52Sequence(text, multiplexer)), stdio.stdout());
    return true;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

const makeInteraction: Effect.Effect<
  DeviceLoginInteractionService,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Stdio.Stdio
> = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const stdio = yield* Stdio.Stdio;
  const impl: DeviceLoginInteractionService = {
    openBrowser: (url) => tryCommands(spawner, browserCommands(url)),
    copyToClipboard: (text) =>
      isSSH.pipe(
        Effect.catch(() => Effect.succeed(false)),
        Effect.flatMap((remote) =>
          remote ? copyThroughTerminal(stdio, text) : tryCommands(spawner, clipboardCommands(text)),
        ),
      ),
  };
  return impl;
});

export const AuthLoginInteractionLive = Layer.mergeAll(
  Layer.effect(
    AuthLoginInteraction,
    Effect.map(makeInteraction, (impl) => impl satisfies AuthLoginInteractionService),
  ),
  Layer.effect(DeviceLoginInteraction, makeInteraction),
);

export interface AuthLoginInteractionTestState {
  readonly openBrowserCalls: Array<string>;
  readonly copyToClipboardCalls: Array<string>;
}

export const AuthLoginInteractionTest = (overrides?: {
  readonly openBrowser?: (url: string) => Effect.Effect<boolean>;
  readonly copyToClipboard?: (text: string) => Effect.Effect<boolean>;
}) => {
  const state: AuthLoginInteractionTestState = {
    openBrowserCalls: [],
    copyToClipboardCalls: [],
  };

  const impl: DeviceLoginInteractionService = {
    openBrowser: (url) =>
      Effect.gen(function* () {
        state.openBrowserCalls.push(url);
        return yield* overrides?.openBrowser?.(url) ?? Effect.succeed(false);
      }),
    copyToClipboard: (text) =>
      Effect.gen(function* () {
        state.copyToClipboardCalls.push(text);
        return yield* overrides?.copyToClipboard?.(text) ?? Effect.succeed(false);
      }),
  };

  const layer = Layer.mergeAll(
    Layer.succeed(AuthLoginInteraction, impl satisfies AuthLoginInteractionService),
    Layer.succeed(DeviceLoginInteraction, impl),
  );

  return { layer, state };
};

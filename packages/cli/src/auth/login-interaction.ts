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
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";

import {
  DeviceLoginInteraction,
  type DeviceLoginInteractionService,
} from "@axm.sh/core/unstable/auth";

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
>()("@axm.sh/cli/AuthLoginInteraction") {}

const runCommand = (invocation: CommandInvocation) =>
  Effect.tryPromise({
    try: async () => {
      const { spawn } = await import("node:child_process");

      return await new Promise<boolean>((resolve, reject) => {
        const child = spawn(invocation.command, [...invocation.args], {
          stdio: ["pipe", "ignore", "ignore"],
          windowsHide: true,
        });

        child.on("error", reject);
        child.on("close", (code) => resolve(code === 0));
        child.stdin.on("error", () => resolve(false));

        if (invocation.stdinText !== undefined) {
          child.stdin.end(invocation.stdinText);
        } else {
          child.stdin.end();
        }
      });
    },
    catch: () => false,
  }).pipe(Effect.catch(() => Effect.succeed(false)));

const tryCommands = (invocations: ReadonlyArray<CommandInvocation>) =>
  Effect.gen(function* () {
    for (const invocation of invocations) {
      const succeeded = yield* runCommand(invocation);
      if (succeeded) {
        return true;
      }
    }

    return false;
  });

const browserCommands = (url: string): ReadonlyArray<CommandInvocation> => {
  switch (process.platform) {
    case "darwin":
      return [{ command: "open", args: [url] }];
    case "win32":
      return [{ command: "cmd", args: ["/c", "start", "", url] }];
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

const interactionImpl: DeviceLoginInteractionService = {
  openBrowser: (url) => tryCommands(browserCommands(url)),
  copyToClipboard: (text) => tryCommands(clipboardCommands(text)),
};

export const AuthLoginInteractionLive = Layer.mergeAll(
  Layer.succeed(AuthLoginInteraction, interactionImpl satisfies AuthLoginInteractionService),
  Layer.succeed(DeviceLoginInteraction, interactionImpl),
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

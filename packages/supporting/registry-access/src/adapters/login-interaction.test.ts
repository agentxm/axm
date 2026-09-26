/**
 * Unit tests for platform login integration command selection.
 */

import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { DeviceLoginInteraction } from "../authentication/device-login.js";
import { AuthEnvironment } from "./environment.js";
import { AuthLoginInteractionLive, browserCommands, osc52Sequence } from "./login-interaction.js";

const ESC = "\u001b";
const BEL = "\u0007";
const LINK = "https://agentxm.ai/device?user_code=WDJB-MJHT";
const LINK_BASE64 = Buffer.from(LINK).toString("base64");

describe("browserCommands", () => {
  it("uses rundll32 on Windows so OAuth query strings are passed as one URL", () => {
    const url = "https://agentxm.ai/oauth/authorize?response_type=code&client_id=axm-cli&state=abc";

    expect(browserCommands(url, "win32")).toEqual([
      {
        command: "rundll32",
        args: ["url.dll,FileProtocolHandler", url],
      },
    ]);
  });
});

describe("osc52Sequence", () => {
  it("asks the terminal to set its clipboard to the base64 payload", () => {
    expect(osc52Sequence(LINK)).toBe(`${ESC}]52;c;${LINK_BASE64}${BEL}`);
  });

  it("wraps the sequence in tmux passthrough with every escape doubled", () => {
    expect(osc52Sequence(LINK, "tmux")).toBe(
      `${ESC}Ptmux;${ESC}${ESC}]52;c;${LINK_BASE64}${BEL}${ESC}\\`,
    );
  });

  it("wraps the sequence in screen passthrough", () => {
    expect(osc52Sequence(LINK, "screen")).toBe(`${ESC}P${ESC}]52;c;${LINK_BASE64}${BEL}${ESC}\\`);
  });
});

/**
 * The live interaction over a recorded terminal and a spawner that runs
 * nothing: every spawned clipboard command is recorded and fails.
 */
const liveInteraction = (options: {
  readonly environment: Record<string, string>;
  readonly stdoutIsTerminal: boolean;
}) => {
  const written: Array<string> = [];
  const spawned: Array<string> = [];
  const stdio = Stdio.layerTest({
    stdoutIsTerminal: Effect.succeed(options.stdoutIsTerminal),
    stdout: () =>
      Sink.forEach((chunk: string | Uint8Array) =>
        Effect.sync(() => {
          written.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        }),
      ),
  });
  const spawner = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.suspend(() => {
        if (command._tag === "StandardCommand") spawned.push(command.command);
        return Effect.fail(
          PlatformError.systemError({ _tag: "NotFound", module: "test", method: "spawn" }),
        );
      }),
    ),
  );
  const layer = Layer.mergeAll(
    AuthLoginInteractionLive.pipe(Layer.provide(Layer.mergeAll(stdio, spawner))),
    Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord(options.environment)),
  );
  return { layer, written, spawned };
};

describe("copyToClipboard", () => {
  it.effect("over SSH copies through the terminal, not a clipboard command", () => {
    const { layer, written, spawned } = liveInteraction({
      environment: { SSH_TTY: "/dev/pts/0" },
      stdoutIsTerminal: true,
    });

    return Effect.gen(function* () {
      const interaction = yield* DeviceLoginInteraction;
      expect(yield* interaction.copyToClipboard(LINK)).toBe(true);
      expect(written).toEqual([osc52Sequence(LINK)]);
      expect(spawned).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("over SSH inside tmux sends the tmux passthrough form", () => {
    const { layer, written } = liveInteraction({
      environment: { SSH_CLIENT: "10.0.0.1 50000 22", TMUX: "/tmp/tmux-1000/default,1,0" },
      stdoutIsTerminal: true,
    });

    return Effect.gen(function* () {
      const interaction = yield* DeviceLoginInteraction;
      expect(yield* interaction.copyToClipboard(LINK)).toBe(true);
      expect(written).toEqual([osc52Sequence(LINK, "tmux")]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("over SSH inside screen sends the screen passthrough form", () => {
    const { layer, written } = liveInteraction({
      environment: { SSH_TTY: "/dev/pts/0", STY: "1234.pts-0.host" },
      stdoutIsTerminal: true,
    });

    return Effect.gen(function* () {
      const interaction = yield* DeviceLoginInteraction;
      expect(yield* interaction.copyToClipboard(LINK)).toBe(true);
      expect(written).toEqual([osc52Sequence(LINK, "screen")]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("over SSH without a terminal on stdout reports that nothing was copied", () => {
    const { layer, written, spawned } = liveInteraction({
      environment: { SSH_TTY: "/dev/pts/0" },
      stdoutIsTerminal: false,
    });

    return Effect.gen(function* () {
      const interaction = yield* DeviceLoginInteraction;
      expect(yield* interaction.copyToClipboard(LINK)).toBe(false);
      expect(written).toEqual([]);
      expect(spawned).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "locally uses the platform clipboard commands and writes nothing to the terminal",
    () => {
      const { layer, written, spawned } = liveInteraction({
        environment: {},
        stdoutIsTerminal: true,
      });

      return Effect.gen(function* () {
        const interaction = yield* DeviceLoginInteraction;
        expect(yield* interaction.copyToClipboard(LINK)).toBe(false);
        expect(spawned.length).toBeGreaterThan(0);
        expect(written).toEqual([]);
      }).pipe(Effect.provide(layer));
    },
  );
});

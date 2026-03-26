// ==========================================================================
// install.ts — Reference pattern for LONG-RUNNING commands using CliRenderer
//
// Demonstrates how CliRenderer.withSpinner() replaces manual NDJSON streaming:
//   - In text mode: shows an interactive spinner with status updates
//   - In stream-json mode: emits NDJSON progress events automatically
//   - In json mode: runs silently, only emits final result
//
// The handler is completely format-agnostic. No emitEvent(), no format
// branching. The CliRenderer service handles all format differences.
// ==========================================================================
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withRuntime } from "../../runtime.js";

// ---------------------------------------------------------------------------
// Text renderer
// ---------------------------------------------------------------------------

const renderText = (source: string, installed: ReadonlyArray<string>): string => {
  const lines = [
    `\u2713 Installed ${installed.length} skill(s) from ${source}`,
    ...installed.map((s) => `  \u2022 ${s}`),
  ];
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Command
//
// Key differences from list.ts:
//   - withRuntime(..., { isLongRunning: true }) sets pipe default to stream-json
//   - CliRenderer.withSpinner() wraps the long-running work
//   - The spinner handle provides .update() for status updates
//   - Per-command --yes flag imported from core (demonstrates the pattern)
// ---------------------------------------------------------------------------

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("GitHub shorthand (owner/repo), local path, or URL"),
  ),
  scope: Flag.choice("scope", ["project", "user"] as const).pipe(
    Flag.withDescription("Configuration scope"),
    Flag.withDefault("project" as const),
  ),
  skill: Flag.string("skill").pipe(
    Flag.withDescription("Install only specified skill(s) by name"),
    Flag.atLeast(0),
  ),
  all: Flag.boolean("all").pipe(Flag.withDescription("Install all discovered skills")),
  yes: yesFlag,
} as const;

export const installCommand = Command.make("install", installConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;

      // CliRenderer.withSpinner handles format differences:
      //   text        → shows animated spinner with status messages
      //   stream-json → emits NDJSON progress events
      //   json        → runs silently (no output until result)
      const skills = yield* renderer.withSpinner(
        `Installing from ${config.source}`,
        (handle) =>
          Effect.gen(function* () {
            yield* handle.update("Downloading...");
            yield* Effect.sleep("200 millis");
            yield* handle.update("Resolving skills from manifest...");
            yield* Effect.sleep("100 millis");
            yield* handle.update("Installing skills...");
            yield* Effect.sleep("100 millis");
            return ["pr-review", "test-gen", "doc-writer"] as const;
          }),
        { successMessage: "Installation complete" },
      );

      yield* renderer.success(renderText(config.source, skills));
    }),
    { command: "skills install", isLongRunning: true },
  ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install skills from GitHub or local path"),
  Command.withExamples([
    { command: "axm-spike skills install owner/repo", description: "Install skills interactively" },
    {
      command: "axm-spike skills install owner/repo@v1.0.0",
      description: "Install from a specific version",
    },
    {
      command: "axm-spike skills install ./local/path",
      description: "Install from a local directory",
    },
    {
      command: "axm-spike skills install owner/repo --all --yes",
      description: "Install all without prompts",
    },
  ]),
);

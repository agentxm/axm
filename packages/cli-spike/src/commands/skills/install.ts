// ==========================================================================
// install.ts — Reference pattern for LONG-RUNNING commands using Activity service
//
// Demonstrates how Activity.withSpinner() replaces manual NDJSON streaming:
//   - In text mode: shows an interactive spinner with status updates
//   - In stream-json mode: emits NDJSON progress events automatically
//   - In json mode: runs silently, only emits final result
//
// The handler is completely format-agnostic. No emitEvent(), no format
// branching. The Activity service handles all format differences.
// ==========================================================================
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { Output } from "@axm.sh/core/unstable/output";
import { Activity } from "@axm.sh/core/unstable/activity";
import { yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withRuntime } from "../../runtime.js";

// ---------------------------------------------------------------------------
// Output schema — the JSON contract for `skills install`
// ---------------------------------------------------------------------------

export const InstallResultSchema = Schema.Struct({
  _version: Schema.Literal(1),
  source: Schema.String,
  installed: Schema.Array(Schema.String),
});
export type InstallResult = typeof InstallResultSchema.Type;

// ---------------------------------------------------------------------------
// Text renderer
// ---------------------------------------------------------------------------

const renderText = (result: InstallResult): string => {
  const lines = [
    `\u2713 Installed ${result.installed.length} skill(s) from ${result.source}`,
    ...result.installed.map((s) => `  \u2022 ${s}`),
  ];
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Command
//
// Key differences from list.ts:
//   - withRuntime(..., { isLongRunning: true }) sets pipe default to stream-json
//   - Activity.withSpinner() wraps the long-running work
//   - The spinner handle provides .message() for status updates
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

export const installCommand = Command.make(
  "install",
  installConfig,
  (config) =>
    withRuntime(
      Effect.gen(function* () {
        const activity = yield* Activity;
        const output = yield* Output;

        // Activity.withSpinner handles format differences:
        //   text        → shows animated spinner with status messages
        //   stream-json → emits NDJSON progress events
        //   json        → runs silently (no output until result)
        const skills = yield* activity.withSpinner(
          `Installing from ${config.source}`,
          (handle) =>
            Effect.gen(function* () {
              yield* handle.message("Downloading...");
              yield* Effect.sleep("200 millis");
              yield* handle.message("Resolving skills from manifest...");
              yield* Effect.sleep("100 millis");
              yield* handle.message("Installing skills...");
              yield* Effect.sleep("100 millis");
              return ["pr-review", "test-gen", "doc-writer"] as const;
            }),
          "Installation complete",
        );

        const result: InstallResult = {
          _version: 1,
          source: config.source,
          installed: Array.from(skills),
        };
        yield* output.result(InstallResultSchema, result, renderText);
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
    {
      command: "axm-spike skills install owner/repo --output-format json",
      description: "Install with JSON output",
    },
  ]),
);

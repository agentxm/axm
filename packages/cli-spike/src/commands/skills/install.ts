// ==========================================================================
// install.ts — Reference pattern for LONG-RUNNING commands with NDJSON streaming
//
// This file demonstrates how long-running operations differ from instant
// commands (compare with list.ts):
//
//   - resolveOutputFormat(explicit, true) — the `true` signals long-running,
//     so piped output defaults to "stream-json" instead of "json"
//   - In stream-json mode, emitEvent() sends incremental progress events
//     BEFORE the final result. Each line is independently parseable.
//   - In text/json mode, only the final result is emitted (no progress).
//
// NDJSON event sequence for stream-json:
//   {"type":"progress","phase":"download","percent":0,...}
//   {"type":"progress","phase":"download","percent":100,...}
//   {"type":"log","level":"info","message":"Resolved 3 skills..."}
//   {"type":"progress","phase":"install","percent":33,...}
//   {"type":"progress","phase":"install","percent":66,...}
//   {"type":"progress","phase":"install","percent":100,...}
//   {"type":"result","data":{"_version":1,"source":"...","installed":[...]}}
//
// The "result" event is always last. Consumers can stop reading after it.
// ==========================================================================
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { outputFormatFlag } from "../../main.js";
import { emitEvent, resolveOutputFormat, writeOutput } from "../../output.js";

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
    `✓ Installed ${result.installed.length} skill(s) from ${result.source}`,
    ...result.installed.map((s) => `  • ${s}`),
  ];
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Simulated long-running install (demonstrates NDJSON streaming)
//
// The format branching is intentional: stream-json emits incremental events
// for real-time UI updates in desktop apps, while text/json modes only emit
// the final result. In a real implementation, the business logic wouldn't
// change — only the observability layer (progress events) differs.
//
// Effect.sleep simulates network/disk latency. In production, natural I/O
// would provide the delays, and progress events would be emitted at
// meaningful checkpoints (download complete, each skill installed, etc.).
// ---------------------------------------------------------------------------

const simulateInstall = (source: string, format: "text" | "json" | "stream-json") =>
  Effect.gen(function* () {
    const skills = ["pr-review", "test-gen", "doc-writer"];

    if (format === "stream-json") {
      // NDJSON progress events — each line is independently parseable
      yield* emitEvent({
        type: "progress",
        phase: "download",
        percent: 0,
        message: `Downloading ${source}`,
      });
      yield* Effect.sleep("200 millis");
      yield* emitEvent({
        type: "progress",
        phase: "download",
        percent: 100,
        message: "Download complete",
      });

      yield* emitEvent({
        type: "log",
        level: "info",
        message: `Resolved ${skills.length} skills from manifest`,
      });

      for (let i = 0; i < skills.length; i++) {
        yield* emitEvent({
          type: "progress",
          phase: "install",
          percent: Math.round(((i + 1) / skills.length) * 100),
          message: `Installing ${skills[i]}`,
        });
        yield* Effect.sleep("100 millis");
      }
    }

    const result: InstallResult = { _version: 1, source, installed: skills };

    yield* writeOutput(format, InstallResultSchema, result, renderText);
  });

// ---------------------------------------------------------------------------
// Command
//
// Key difference from list.ts: resolveOutputFormat(explicit, true) passes
// isLongRunning=true, which changes the pipe default from "json" to
// "stream-json". This means `axm skills install foo/bar | jq` gets NDJSON
// with progress events instead of blocking until completion.
// ---------------------------------------------------------------------------

export const installCommand = Command.make(
  "install",
  {
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
  },
  (config) =>
    Effect.gen(function* () {
      const explicitFormat = yield* outputFormatFlag;
      const format = resolveOutputFormat(explicitFormat, true); // long-running → stream-json when piped

      yield* simulateInstall(config.source, format);
    }),
).pipe(
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
      description: "Install with JSON output (for scripting)",
    },
  ]),
);

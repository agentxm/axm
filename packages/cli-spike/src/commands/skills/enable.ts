// ---------------------------------------------------------------------------
// enable.ts — Stub command (placeholder for future implementation)
//
// Stub commands define the CLI interface (args, flags, description) without
// real business logic. To convert a stub to a real command:
//   1. Add an output schema (Schema.Struct with _version: Schema.Literal(1))
//   2. Add a text renderer (pure function: data → string)
//   3. Replace Console.log with the standard handler pattern:
//        const format = resolveOutputFormat(yield* outputFormatFlag);
//        const result = yield* doWork(config);
//        yield* writeOutput(format, schema, result, renderText);
//
// See list.ts (instant) and install.ts (long-running) for complete examples.
// ---------------------------------------------------------------------------
import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

export const enableCommand = Command.make(
  "enable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
  },
  (config) => Console.log(`[stub] skills enable name=${config.name} scope=${config.scope}`),
).pipe(Command.withDescription("Enable a previously disabled skill"));

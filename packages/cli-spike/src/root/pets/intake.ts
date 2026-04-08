// ==========================================================================
// intake.ts — Reference pattern for LONG-RUNNING commands using CliRenderer
//
// Demonstrates how CliRenderer.withSpinner() replaces manual NDJSON streaming:
//   - In text mode: shows an interactive spinner with status updates
//   - In json mode: emits NDJSON progress events on stderr
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

const renderText = (source: string, pets: ReadonlyArray<string>): string => {
  const lines = [
    `\u2713 Logged intake for ${pets.length} pet(s) from ${source}`,
    ...pets.map((pet) => `  \u2022 ${pet}`),
  ];
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Command
//
// Key differences from list.ts:
//   - CliRenderer.withSpinner() wraps the long-running work
//   - The spinner handle provides .update() for status updates
//   - Per-command --yes flag imported from core (demonstrates the pattern)
// ---------------------------------------------------------------------------

const intakeConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Partner intake feed, local file, or URL"),
  ),
  habitat: Flag.choice("habitat", ["showroom", "foster"] as const).pipe(
    Flag.withDescription("Destination habitat"),
    Flag.withDefault("showroom" as const),
  ),
  pet: Flag.string("pet").pipe(
    Flag.withDescription("Intake only specified pet name(s)"),
    Flag.atLeast(0),
  ),
  all: Flag.boolean("all").pipe(Flag.withDescription("Intake all discovered pets")),
  yes: yesFlag,
} as const;

const availablePets = ["Mochi", "Pickles", "Juniper"] as const;

export const intakeCommand = Command.make("intake", intakeConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;

      // CliRenderer.withSpinner handles format differences:
      //   text        → shows animated spinner with status messages
      //   json        → emits NDJSON progress events on stderr
      const pets = yield* renderer.withSpinner(
        `Logging intake from ${config.source}`,
        (handle) =>
          Effect.gen(function* () {
            yield* handle.update("Downloading intake sheet...");
            yield* Effect.sleep("200 millis");
            yield* handle.update(`Reviewing ${config.habitat} pet records...`);
            yield* Effect.sleep("100 millis");
            yield* handle.update("Registering pets...");
            yield* Effect.sleep("100 millis");

            if (config.pet.length > 0) {
              return config.pet;
            }

            if (config.all) {
              return [...availablePets];
            }

            return availablePets.slice(0, 2);
          }),
        { successMessage: "Intake complete" },
      );

      yield* renderer.success(renderText(config.source, pets));
    }),
    { command: "pets intake" },
  ),
).pipe(
  withArgvTracking(intakeConfig),
  Command.withDescription("Intake sample pets from a feed or file"),
  Command.withExamples([
    { command: "axm-spike pets intake partner-feed", description: "Intake a sample feed" },
    {
      command: "axm-spike pets intake partner-feed@spring",
      description: "Intake from a versioned feed",
    },
    {
      command: "axm-spike pets intake ./sample-pets.json",
      description: "Intake from a local file",
    },
    {
      command: "axm-spike pets intake partner-feed --all --yes",
      description: "Intake all pets without prompts",
    },
  ]),
);

import * as Effect from "effect/Effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";

import { yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { type FakePetHabitat, FakePetStore } from "../../fake-pet-store.js";
import { fromInteractivePrompt } from "../prompts/helpers.js";
import { withRuntime } from "../../runtime.js";

const renderIntakeSummary = (source: string, pets: ReadonlyArray<string>): string =>
  [
    `Logged intake for ${pets.length} pet(s) from ${source}`,
    ...pets.map((pet) => `  - ${pet}`),
  ].join("\n");

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

const handleIntake = (args: {
  readonly source: string;
  readonly habitat: FakePetHabitat;
  readonly pet: ReadonlyArray<string>;
  readonly all: boolean;
  readonly yes: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const fakePetStore = yield* FakePetStore;
    const pets = yield* fakePetStore.resolveIntake({
      source: args.source,
      habitat: args.habitat,
      requestedPets: args.pet,
      all: args.all,
    });

    const confirmationMessage = `Intake ${pets.length} pet(s) into ${args.habitat}: ${pets.join(", ")}?`;
    const confirmed = args.yes
      ? true
      : yield* fromInteractivePrompt(Prompt.confirm({ message: confirmationMessage }), {
          message: confirmationMessage,
        });

    if (!confirmed) {
      yield* renderer.info("Intake cancelled");
      return;
    }

    const registeredPets = yield* renderer.withSpinner(
      `Logging intake from ${args.source}`,
      (handle) =>
        Effect.gen(function* () {
          yield* handle.update("Downloading intake sheet...");
          yield* Effect.sleep("200 millis");
          yield* handle.update(`Reviewing ${args.habitat} pet records...`);
          yield* Effect.sleep("100 millis");
          yield* handle.update("Registering pets...");
          yield* Effect.sleep("100 millis");
          return pets;
        }),
      { successMessage: "Intake complete" },
    );

    yield* renderer.success(renderIntakeSummary(args.source, registeredPets));
  });

export const intakeCommand = Command.make(
  "intake",
  intakeConfig,
  ({ source, habitat, pet, all, yes }) =>
    handleIntake({ source, habitat, pet, all, yes }).pipe(withRuntime({ command: "pets intake" })),
).pipe(
  withArgvTracking(intakeConfig),
  Command.withDescription("Intake sample pets from a feed or file"),
  Command.withExamples([
    { command: "axm-spike pets intake partner-feed", description: "Intake a sample feed" },
    {
      command: "axm-spike pets intake ./sample-pets.json --yes",
      description: "Intake from a local file without prompting",
    },
    {
      command: "axm-spike pets intake partner-feed --pet Mochi --pet Pickles --yes",
      description: "Intake only specific pets",
    },
    {
      command: "axm-spike pets intake partner-feed --all --yes",
      description: "Intake every discovered pet",
    },
  ]),
);

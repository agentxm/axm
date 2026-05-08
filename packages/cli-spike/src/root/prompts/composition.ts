import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import type * as PromptTypes from "effect/unstable/cli/Prompt";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { isNonInteractive } from "@agentxm/client-core/unstable/cli-flags";
import { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";
import { withRuntime } from "../../runtime.js";

const speciesValues = ["cat", "dog", "rabbit", "bird", "hamster"] as const;
const habitatValues = ["showroom", "foster", "outdoor"] as const;

const toBoolean = (value: "yes" | "no"): boolean => value === "yes";

interface RegistrationInfo {
  readonly name: string;
  readonly species: (typeof speciesValues)[number];
  readonly age: number;
  readonly adoptable: boolean;
}

interface Registration extends RegistrationInfo {
  readonly habitat: (typeof habitatValues)[number] | "pending";
}

const promptRequired = (message: string) =>
  makeAppError({
    code: "PROMPT_REQUIRED",
    category: "usage",
    message: `Interactive prompt required: ${message}`,
    breadcrumbs: [
      { task: "Recover", description: "Pass the value via a flag or remove --non-interactive." },
    ],
  });

const providedOrPrompt = <A>(
  value: Option.Option<A>,
  prompt: PromptTypes.Prompt<A>,
): PromptTypes.Prompt<A> =>
  Option.match(value, {
    onNone: () => prompt,
    onSome: Prompt.succeed,
  });

const compositionConfig = {
  name: Flag.string("name").pipe(
    Flag.withDescription("Bypass the name prompt with an explicit pet name"),
    Flag.optional,
  ),
  species: Flag.choice("species", speciesValues).pipe(
    Flag.withDescription("Bypass the species prompt with an explicit species"),
    Flag.optional,
  ),
  age: Flag.integer("age").pipe(
    Flag.withDescription("Bypass the age prompt with an explicit age in months"),
    Flag.optional,
  ),
  adoptable: Flag.choice("adoptable", ["yes", "no"] as const).pipe(
    Flag.withDescription("Bypass the adoptable prompt with an explicit answer"),
    Flag.optional,
  ),
  habitat: Flag.choice("habitat", habitatValues).pipe(
    Flag.withDescription("Bypass the habitat prompt with an explicit habitat"),
    Flag.optional,
  ),
} as const;

const handleComposition = (args: {
  readonly name: Option.Option<string>;
  readonly species: Option.Option<(typeof speciesValues)[number]>;
  readonly age: Option.Option<number>;
  readonly adoptable: Option.Option<"yes" | "no">;
  readonly habitat: Option.Option<(typeof habitatValues)[number]>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const nonInteractive = yield* isNonInteractive;

    if (nonInteractive && Option.isNone(args.name)) {
      return yield* promptRequired("Pet name:");
    }
    if (nonInteractive && Option.isNone(args.species)) {
      return yield* promptRequired("Species:");
    }
    if (nonInteractive && Option.isNone(args.age)) {
      return yield* promptRequired("Age in months:");
    }
    if (nonInteractive && Option.isNone(args.adoptable)) {
      return yield* promptRequired("Adoptable?");
    }
    if (
      nonInteractive &&
      Option.isSome(args.adoptable) &&
      toBoolean(args.adoptable.value) &&
      Option.isNone(args.habitat)
    ) {
      return yield* promptRequired("Select habitat:");
    }

    const finalizeRegistration = (petInfo: RegistrationInfo): PromptTypes.Prompt<Registration> =>
      petInfo.adoptable
        ? providedOrPrompt(
            args.habitat,
            Prompt.select({
              message: "Select habitat:",
              choices: [
                { title: "Showroom", value: "showroom" as const },
                { title: "Foster Home", value: "foster" as const },
                { title: "Outdoor Enclosure", value: "outdoor" as const },
              ],
            }),
          ).pipe(Prompt.map((habitat) => ({ ...petInfo, habitat }) satisfies Registration))
        : Prompt.succeed({ ...petInfo, habitat: "pending" } satisfies Registration);

    const registration = yield* Prompt.run(
      Prompt.all({
        name: providedOrPrompt(args.name, Prompt.text({ message: "Pet name:" })),
        species: providedOrPrompt(
          args.species,
          Prompt.select({
            message: "Species:",
            choices: [
              { title: "Cat", value: "cat" as const },
              { title: "Dog", value: "dog" as const },
              { title: "Rabbit", value: "rabbit" as const },
              { title: "Bird", value: "bird" as const },
              { title: "Hamster", value: "hamster" as const },
            ],
          }),
        ),
        age: providedOrPrompt(
          args.age,
          Prompt.integer({ message: "Age in months:", min: 1, max: 360 }),
        ),
        adoptable: providedOrPrompt(
          Option.map(args.adoptable, toBoolean),
          Prompt.toggle({ message: "Adoptable?", active: "yes", inactive: "no" }),
        ),
      }).pipe(Prompt.flatMap(finalizeRegistration)),
    ).pipe(
      Effect.catchTag("QuitError", () =>
        Effect.fail(new PromptCancelled({ message: "Operation cancelled." })),
      ),
    );

    yield* renderer.success(
      [
        `Registered: ${registration.name}`,
        `Species: ${registration.species}`,
        `Age: ${String(registration.age)} months`,
        `Adoptable: ${registration.adoptable ? "yes" : "no"}`,
        `Habitat: ${registration.habitat}`,
      ].join("\n"),
    );
  });

export const compositionCommand = Command.make(
  "composition",
  compositionConfig,
  ({ name, species, age, adoptable, habitat }) =>
    handleComposition({ name, species, age, adoptable, habitat }).pipe(
      withRuntime("prompts composition"),
    ),
).pipe(
  withArgvTracking(compositionConfig),
  Command.withDescription("Demo prompt composition with Prompt.all and conditional follow-up"),
  Command.withExamples([
    {
      command: "axm-spike prompts composition",
      description: "Run the pet registration wizard combining multiple prompts",
    },
    {
      command:
        "axm-spike prompts composition --name Mochi --species cat --age 24 --adoptable yes --habitat showroom",
      description: "Resolve the registration wizard non-interactively",
    },
  ]),
);

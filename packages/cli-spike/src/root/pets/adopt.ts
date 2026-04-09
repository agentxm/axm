import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Prompt } from "effect/unstable/cli";

import { forceFlag, isNonInteractive, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { type AdoptionOutcome, FakePetStore } from "../../fake-pet-store.js";
import { fromInteractivePrompt } from "../prompts/helpers.js";
import { withRuntime } from "../../runtime.js";

const renderPreview = (args: {
  readonly pet: string;
  readonly species: string;
  readonly blocker: Option.Option<string>;
  readonly force: boolean;
}): string =>
  [
    `Preview adoption for ${args.pet}`,
    `Species: ${args.species}`,
    `Force requested: ${args.force ? "yes" : "no"}`,
    Option.match(args.blocker, {
      onNone: () => "Status: ready to adopt",
      onSome: (blocker) => `Blocker: ${blocker}`,
    }),
  ].join("\n");

const renderAdoption = (outcome: AdoptionOutcome): string =>
  [
    `Adopted ${outcome.pet.name}`,
    `Species: ${outcome.pet.species}`,
    `Habitat: ${outcome.pet.habitat}`,
    `Force applied: ${outcome.forced ? "yes" : "no"}`,
  ].join("\n");

const adoptConfig = {
  pet: Argument.string("pet").pipe(Argument.withDescription("Name of the pet to adopt out")),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

const handleAdopt = (args: {
  readonly pet: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const nonInteractive = yield* isNonInteractive;
    const fakePetStore = yield* FakePetStore;
    const plan = yield* fakePetStore.planAdoption(args.pet);
    const previewText = renderPreview({
      pet: plan.pet.name,
      species: plan.pet.species,
      blocker: plan.blocker,
      force: args.force,
    });

    if (args.preview && !args.yes && nonInteractive) {
      yield* renderer.note(previewText, "Preview only");
      return;
    }

    const confirmationMessage = args.preview
      ? `${previewText}\n\nApply this adoption?`
      : Option.match(plan.blocker, {
          onNone: () => `Adopt ${plan.pet.name}?`,
          onSome: (blocker) => `Adopt ${plan.pet.name}? ${blocker}`,
        });

    const confirmed = args.yes
      ? true
      : yield* fromInteractivePrompt(Prompt.confirm({ message: confirmationMessage }), {
          message: confirmationMessage,
        });

    if (!confirmed) {
      yield* renderer.info(args.preview ? "Preview kept unchanged" : "Adoption cancelled");
      return;
    }

    const outcome = yield* fakePetStore.adoptPet(args.pet, args.force);
    yield* renderer.success(renderAdoption(outcome));
  });

export const adoptCommand = Command.make("adopt", adoptConfig, ({ pet, yes, force, preview }) =>
  handleAdopt({ pet, yes, force, preview }).pipe(withRuntime({ command: "pets adopt" })),
).pipe(
  withArgvTracking(adoptConfig),
  Command.withDescription("Adopt out a sample pet"),
  Command.withExamples([
    { command: "axm-spike pets adopt Mochi", description: "Adopt out a pet" },
    {
      command: "axm-spike pets adopt Mochi --preview",
      description: "Preview the adoption action",
    },
    {
      command: "axm-spike pets adopt Mochi --yes",
      description: "Skip the confirmation prompt",
    },
    {
      command: "axm-spike pets adopt Juniper --force --yes",
      description: "Override a demo blocker and continue",
    },
  ]),
);

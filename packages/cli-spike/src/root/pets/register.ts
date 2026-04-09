import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { FakePetStore } from "../../fake-pet-store.js";
import { withRuntime } from "../../runtime.js";

const renderRegistration = (result: {
  readonly name: string;
  readonly species: string;
  readonly tags: ReadonlyArray<string>;
}): string =>
  [
    `Registered ${result.name}`,
    `Species: ${result.species}`,
    `Tags: ${result.tags.length === 0 ? "-" : result.tags.join(", ")}`,
  ].join("\n");

const registerConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the pet to register")),
  species: Flag.string("species").pipe(
    Flag.withDescription("Override the detected species"),
    Flag.optional,
  ),
  tag: Flag.string("tag").pipe(
    Flag.withDescription("Pet tags to attach (can be repeated)"),
    Flag.atLeast(1),
    Flag.optional,
  ),
} as const;

const handleRegister = (args: {
  readonly name: string;
  readonly species: Option.Option<string>;
  readonly tag: Option.Option<ReadonlyArray<string>>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const fakePetStore = yield* FakePetStore;
    const registeredPet = yield* fakePetStore.registerPet({
      name: args.name,
      species: args.species,
      tags: args.tag,
    });

    yield* renderer.success(renderRegistration(registeredPet));
  });

export const registerCommand = Command.make("register", registerConfig, ({ name, species, tag }) =>
  handleRegister({ name, species, tag }).pipe(withRuntime("pets register")),
).pipe(
  withArgvTracking(registerConfig),
  Command.withDescription("Register a sample pet"),
  Command.withExamples([
    { command: "axm-spike pets register Mochi", description: "Register a new pet" },
    {
      command: "axm-spike pets register Mochi --species cat",
      description: "Register with an explicit species",
    },
    {
      command: "axm-spike pets register Mochi --tag shy --tag lap-cat",
      description: "Register with repeated tags",
    },
  ]),
);

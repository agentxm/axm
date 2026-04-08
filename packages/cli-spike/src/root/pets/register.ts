import * as Console from "effect/Console";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { withRuntime } from "../../runtime.js";

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

export const registerCommand = Command.make("register", registerConfig, (config) => {
  const species = Option.getOrElse(config.species, () => "unknown");
  const tags = Option.match(config.tag, {
    onNone: () => "-",
    onSome: (petTags) => petTags.join(", "),
  });

  return withRuntime(
    Console.log(`[stub] pets register name=${config.name} species=${species} tags=${tags}`),
    { command: "pets register" },
  );
}).pipe(
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

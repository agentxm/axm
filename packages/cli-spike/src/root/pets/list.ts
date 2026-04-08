import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { type FakePetHabitat, type FakePetRecord, FakePetStore } from "../../fake-pet-store.js";
import { emitItemsResult } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

const petListItemSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
  habitat: Schema.Literals(["showroom", "foster"] as const),
});

const petColumns = [
  {
    key: "name",
    header: "Name",
    value: (pet: FakePetRecord) => pet.name,
    priority: 1,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "species",
    header: "Species",
    value: (pet: FakePetRecord) => pet.species,
    priority: 2,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "age",
    header: "Age",
    value: (pet: FakePetRecord) => pet.age,
    priority: 3,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "adoptable",
    header: "Adoptable",
    value: (pet: FakePetRecord) => (pet.adoptable ? "yes" : "no"),
    priority: 4,
    align: "left" as const,
    width: "auto" as const,
  },
] as const;

const listConfig = {
  habitat: Flag.choice("habitat", ["showroom", "foster"] as const).pipe(
    Flag.withDescription("Pet habitat to inspect"),
    Flag.withDefault("showroom" as const),
  ),
  species: Flag.string("species").pipe(Flag.withDescription("Filter by species"), Flag.atLeast(0)),
} as const;

const commandMeta = spikeCommandMeta("pets list", { json: true });

const handleList = (args: {
  readonly habitat: FakePetHabitat;
  readonly species: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const fakePetStore = yield* FakePetStore;
    const pets = yield* fakePetStore.listPets(args.habitat);
    const filteredPets =
      args.species.length === 0 ? pets : pets.filter((pet) => args.species.includes(pet.species));

    if (yield* emitItemsResult("pets.list", filteredPets, petListItemSchema)) {
      return;
    }

    if (filteredPets.length === 0) {
      yield* renderer.info(`No ${args.habitat} pets matched the selected filters.`);
      return;
    }

    yield* renderer.table(filteredPets, petColumns, `${args.habitat} sample pets`);
  });

export const listCommand = Command.make("list", listConfig, ({ habitat, species }) =>
  handleList({ habitat, species }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(listConfig),
  annotateCommandMeta(commandMeta),
  Command.withAlias("ls"),
  Command.withDescription("List sample pets"),
  Command.withExamples([
    { command: "axm-spike pets list", description: "List showroom pets" },
    {
      command: "axm-spike pets list --habitat foster",
      description: "List foster pets",
    },
    {
      command: "axm-spike pets list --species cat",
      description: "Filter pets by species",
    },
    {
      command: "axm-spike pets list --json",
      description: "Emit a structured machine-readable result document",
    },
  ]),
);

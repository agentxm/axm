import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer, column, hidden } from "@axm.sh/core/unstable/cli-renderer";
import { JsonSchemaVersion, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { type FakePetHabitat, FakePetStore } from "../../fake-pet-store.js";
import { makeItemsDocumentSchema } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

export const PetListItemSchema = Schema.Struct({
  name: Schema.String.pipe(column({ header: "Name", priority: 1 })),
  species: Schema.String.pipe(column({ header: "Species", priority: 2 })),
  age: Schema.String.pipe(column({ header: "Age", priority: 3 })),
  adoptable: Schema.Boolean.pipe(
    column({
      header: "Adoptable",
      priority: 4,
      format: (value) => (value === true ? "yes" : "no"),
    }),
  ),
  habitat: Schema.Literals(["showroom", "foster"] as const).pipe(hidden()),
});

export type PetListItem = typeof PetListItemSchema.Type;
export const PetsListOutputSchema = makeItemsDocumentSchema("pets.list", PetListItemSchema);
export type PetsListOutput = typeof PetsListOutputSchema.Type;

const listConfig = {
  habitat: Flag.choice("habitat", ["showroom", "foster"] as const).pipe(
    Flag.withDescription("Pet habitat to inspect"),
    Flag.withDefault("showroom" as const),
  ),
  species: Flag.string("species").pipe(Flag.withDescription("Filter by species"), Flag.atLeast(0)),
} as const;

const commandMeta = spikeCommandMeta("pets list", { json: true });

export const handleList = (args: {
  readonly habitat: FakePetHabitat;
  readonly species: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const fakePetStore = yield* FakePetStore;
    const pets = yield* fakePetStore.listPets(args.habitat);
    const filteredPets =
      args.species.length === 0 ? pets : pets.filter((pet) => args.species.includes(pet.species));
    const document: PetsListOutput = {
      _version: JsonSchemaVersion,
      command: "pets.list",
      items: filteredPets,
      count: filteredPets.length,
    };

    if (yield* renderer.result(document, PetsListOutputSchema)) {
      return;
    }

    if (filteredPets.length === 0) {
      yield* renderer.info(`No ${args.habitat} pets matched the selected filters.`);
      return;
    }

    yield* renderer.table(filteredPets, PetListItemSchema, `${args.habitat} sample pets`);
  });

export const listCommand = Command.make("list", listConfig, ({ habitat, species }) =>
  handleList({ habitat, species }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(listConfig),
  annotateCommandMeta(commandMeta),
  Command.withAlias("ls"),
  Command.withDescription("List sample pets. JSON output includes items[] and count."),
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
      description: "Emit { _version, command, items, count }",
    },
  ]),
);

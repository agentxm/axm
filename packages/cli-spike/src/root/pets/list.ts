import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import {
  makeCommandDocumentSchema,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";

import { type FakePetHabitat, FakePetStore } from "../../fake-pet-store.js";
import { withRuntime } from "../../runtime.js";

export const PetListItemSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
  habitat: Schema.Literals(["showroom", "foster"] as const),
});

export type PetListItem = typeof PetListItemSchema.Type;
interface PetListTableRow {
  readonly name: string;
  readonly species: string;
  readonly age: string;
  readonly adoptable: boolean;
}

const PetListTable = {
  columns: {
    name: { header: "Name" },
    species: { header: "Species" },
    age: { header: "Age" },
    adoptable: {
      header: "Adoptable",
      render: (value: boolean) => (value ? "yes" : "no"),
    },
  },
} as const satisfies TableView<PetListTableRow>;

const PetsListDocumentFields = {
  items: Schema.Array(PetListItemSchema),
  count: Schema.Number,
} satisfies Schema.Struct.Fields;

export const PetsListOutputSchema = makeCommandDocumentSchema("pets.list", PetsListDocumentFields);
export type PetsListOutput = typeof PetsListOutputSchema.Type;

const listConfig = {
  habitat: Flag.choice("habitat", ["showroom", "foster"] as const).pipe(
    Flag.withDescription("Pet habitat to inspect"),
    Flag.withDefault("showroom" as const),
  ),
  species: Flag.string("species").pipe(Flag.withDescription("Filter by species"), Flag.atLeast(0)),
} as const;

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

    if (
      yield* renderer.document(
        "pets.list",
        { items: filteredPets, count: filteredPets.length },
        PetsListDocumentFields,
      )
    ) {
      return;
    }

    if (filteredPets.length === 0) {
      yield* renderer.info(`No ${args.habitat} pets matched the selected filters.`);
      return;
    }

    const rows: ReadonlyArray<PetListTableRow> = filteredPets.map((pet) => ({
      name: pet.name,
      species: pet.species,
      age: pet.age,
      adoptable: pet.adoptable,
    }));

    yield* renderer.table(rows, PetListTable, `${args.habitat} sample pets`);
  });

export const listCommand = Command.make("list", listConfig, ({ habitat, species }) =>
  handleList({ habitat, species }).pipe(withRuntime("pets list")),
).pipe(
  withArgvTracking(listConfig),
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
      description: "Emit { command, items, count }",
    },
  ]),
);

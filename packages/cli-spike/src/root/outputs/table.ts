import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { JsonSchemaVersion, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { makeItemsDocumentSchema } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

export const SamplePetSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
});

type SamplePet = typeof SamplePetSchema.Type;
export const OutputsTableOutputSchema = makeItemsDocumentSchema("outputs.table", SamplePetSchema);
export type OutputsTableOutput = typeof OutputsTableOutputSchema.Type;

const samplePets: ReadonlyArray<SamplePet> = [
  { name: "Mochi", species: "cat", age: "2 years", adoptable: true },
  { name: "Pickles", species: "dog", age: "4 months", adoptable: true },
  { name: "Juniper", species: "rabbit", age: "1 year", adoptable: false },
  { name: "Waffles", species: "guinea pig", age: "9 months", adoptable: true },
];

const tableConfig = {
  caption: Flag.string("caption").pipe(Flag.withDescription("Table caption"), Flag.optional),
} as const;

const tableColumns = [
  {
    key: "name",
    header: "Name",
    value: (pet: SamplePet) => pet.name,
    priority: 1,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "species",
    header: "Species",
    value: (pet: SamplePet) => pet.species,
    priority: 2,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "age",
    header: "Age",
    value: (pet: SamplePet) => pet.age,
    priority: 3,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "adoptable",
    header: "Adoptable",
    value: (pet: SamplePet) => (pet.adoptable ? "yes" : "no"),
    priority: 4,
    align: "left" as const,
    width: "auto" as const,
  },
] as const;

const commandMeta = spikeCommandMeta("outputs table", { json: true });

export const handleTable = (args: { readonly caption: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: OutputsTableOutput = {
      _version: JsonSchemaVersion,
      command: "outputs.table",
      items: samplePets,
      count: samplePets.length,
    };

    if (yield* renderer.result(document, OutputsTableOutputSchema)) {
      return;
    }

    yield* renderer.table(samplePets, tableColumns, Option.getOrUndefined(args.caption));
  });

export const tableCommand = Command.make("table", tableConfig, ({ caption }) =>
  handleTable({ caption }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(tableConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Render table data. JSON output includes items[] and count."),
  Command.withExamples([
    {
      command: 'axm-spike outputs table --caption "Adoptable pets"',
      description: "Render a table with a caption",
    },
    {
      command: "axm-spike outputs table --json",
      description: "Emit { _version, command, items, count }",
    },
  ]),
);

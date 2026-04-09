import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer, type TableView } from "@axm.sh/core/unstable/cli-renderer";
import { makeCommandDocumentSchema, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { withRuntime } from "../../runtime.js";

export const SamplePetSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
});

type SamplePet = typeof SamplePetSchema.Type;
const SamplePetTable = {
  columns: {
    name: { header: "Name" },
    species: { header: "Species" },
    age: { header: "Age" },
    adoptable: {
      header: "Adoptable",
      render: (value: boolean) => (value ? "yes" : "no"),
    },
  },
} as const satisfies TableView<SamplePet>;

const OutputsTableDocumentFields = {
  items: Schema.Array(SamplePetSchema),
  count: Schema.Number,
} satisfies Schema.Struct.Fields;

export const OutputsTableOutputSchema = makeCommandDocumentSchema(
  "outputs.table",
  OutputsTableDocumentFields,
);
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

const commandMeta = spikeCommandMeta("outputs table", { json: true });

export const handleTable = (args: { readonly caption: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    if (
      yield* renderer.document(
        "outputs.table",
        { items: samplePets, count: samplePets.length },
        OutputsTableDocumentFields,
      )
    ) {
      return;
    }

    yield* renderer.table(samplePets, SamplePetTable, Option.getOrUndefined(args.caption));
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

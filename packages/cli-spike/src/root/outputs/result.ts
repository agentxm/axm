import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer, column } from "@axm.sh/core/unstable/cli-renderer";
import { JsonSchemaVersion, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { withRuntime } from "../../runtime.js";

export const PetResultSchema = Schema.Struct({
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
});

type PetResult = typeof PetResultSchema.Type;
export const OutputsResultSingleDataSchema = Schema.Struct({
  kind: Schema.Literal("single"),
  item: PetResultSchema,
});
export const OutputsResultListDataSchema = Schema.Struct({
  kind: Schema.Literal("list"),
  items: Schema.Array(PetResultSchema),
});
export const OutputsResultDataSchema = Schema.Union([
  OutputsResultSingleDataSchema,
  OutputsResultListDataSchema,
]);
export const OutputsResultOutputSchema = Schema.Struct({
  _version: Schema.Literal(JsonSchemaVersion),
  command: Schema.Literal("outputs.result"),
  data: OutputsResultDataSchema,
  count: Schema.Number,
});
export type OutputsResultOutput = typeof OutputsResultOutputSchema.Type;

const sampleData: PetResult = {
  name: "Mochi",
  species: "cat",
  age: "2 years",
  adoptable: true,
};

const sampleStreamData: ReadonlyArray<PetResult> = [
  sampleData,
  { name: "Pickles", species: "dog", age: "4 months", adoptable: true },
  { name: "Juniper", species: "rabbit", age: "1 year", adoptable: false },
];

const resultConfig = {
  stream: Flag.boolean("stream").pipe(
    Flag.withDescription("Emit the sample list instead of a single item"),
  ),
} as const;

const commandMeta = spikeCommandMeta("outputs result", { json: true });

export const handleResult = (args: { readonly stream: boolean }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: OutputsResultOutput = args.stream
      ? {
          _version: JsonSchemaVersion,
          command: "outputs.result",
          data: {
            kind: "list",
            items: sampleStreamData,
          },
          count: sampleStreamData.length,
        }
      : {
          _version: JsonSchemaVersion,
          command: "outputs.result",
          data: {
            kind: "single",
            item: sampleData,
          },
          count: 1,
        };

    if (yield* renderer.result(document, OutputsResultOutputSchema)) {
      return;
    }

    if (args.stream) {
      yield* renderer.table(sampleStreamData, PetResultSchema, "Sample pets");
      return;
    }

    yield* renderer.detail(sampleData, PetResultSchema, "Sample pet");
  });

export const resultCommand = Command.make("result", resultConfig, ({ stream }) =>
  handleResult({ stream }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(resultConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription(
    "Render structured result output. JSON output always includes count and data.kind (single or list).",
  ),
  Command.withExamples([
    {
      command: "axm-spike outputs result",
      description: "Render one structured sample record",
    },
    {
      command: "axm-spike outputs result --stream",
      description: "Render the sample list instead of one record",
    },
    {
      command: "axm-spike outputs result --json",
      description: "Emit count plus data.kind=single with data.item",
    },
    {
      command: "axm-spike outputs result --stream --json",
      description: "Emit count plus data.kind=list with data.items[]",
    },
  ]),
);

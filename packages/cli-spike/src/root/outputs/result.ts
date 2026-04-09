import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer, type DetailView, type TableView } from "@axm.sh/core/unstable/cli-renderer";
import { makeCommandDocumentSchema, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

export const PetResultSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
});

type PetResult = typeof PetResultSchema.Type;
const PetResultTable = {
  columns: {
    name: { header: "Name" },
    species: { header: "Species" },
    age: { header: "Age" },
    adoptable: {
      header: "Adoptable",
      render: (value: boolean) => (value ? "yes" : "no"),
    },
  },
} as const satisfies TableView<PetResult>;

const PetResultDetail = {
  fields: {
    name: { label: "Name" },
    species: { label: "Species" },
    age: { label: "Age" },
    adoptable: {
      label: "Adoptable",
      render: (value: boolean) => (value ? "yes" : "no"),
    },
  },
} as const satisfies DetailView<PetResult>;

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

const OutputsResultDocumentFields = {
  data: OutputsResultDataSchema,
  count: Schema.Number,
} satisfies Schema.Struct.Fields;

export const OutputsResultOutputSchema = makeCommandDocumentSchema(
  "outputs.result",
  OutputsResultDocumentFields,
);
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

export const handleResult = (args: { readonly stream: boolean }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const body: Schema.Struct.Type<typeof OutputsResultDocumentFields> = args.stream
      ? {
          data: {
            kind: "list",
            items: sampleStreamData,
          },
          count: sampleStreamData.length,
        }
      : {
          data: {
            kind: "single",
            item: sampleData,
          },
          count: 1,
        };

    if (yield* renderer.document("outputs.result", body, OutputsResultDocumentFields)) {
      return;
    }

    if (args.stream) {
      yield* renderer.table(sampleStreamData, PetResultTable, "Sample pets");
      return;
    }

    yield* renderer.detail(sampleData, PetResultDetail, "Sample pet");
  });

export const resultCommand = Command.make("result", resultConfig, ({ stream }) =>
  handleResult({ stream }).pipe(withRuntime("outputs result")),
).pipe(
  withArgvTracking(resultConfig),
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

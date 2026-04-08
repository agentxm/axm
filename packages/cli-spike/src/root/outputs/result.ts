import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { emitDataResult, emitItemsResult } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

const PetResultSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
});

type PetResult = typeof PetResultSchema.Type;

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

const petColumns = [
  {
    key: "name",
    header: "Name",
    value: (pet: PetResult) => pet.name,
    priority: 1,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "species",
    header: "Species",
    value: (pet: PetResult) => pet.species,
    priority: 2,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "age",
    header: "Age",
    value: (pet: PetResult) => pet.age,
    priority: 3,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "adoptable",
    header: "Adoptable",
    value: (pet: PetResult) => (pet.adoptable ? "yes" : "no"),
    priority: 4,
    align: "left" as const,
    width: "auto" as const,
  },
] as const;

const resultConfig = {
  stream: Flag.boolean("stream").pipe(
    Flag.withDescription("Emit the sample list instead of a single item"),
  ),
} as const;

const commandMeta = spikeCommandMeta("outputs result", { json: true });

const handleResult = (args: { readonly stream: boolean }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    if (args.stream) {
      if (yield* emitItemsResult("outputs.result", sampleStreamData, PetResultSchema)) {
        return;
      }

      yield* renderer.table(sampleStreamData, petColumns, "Sample pets");
      return;
    }

    if (yield* emitDataResult("outputs.result", sampleData, PetResultSchema)) {
      return;
    }

    yield* renderer.detail(sampleData, petColumns, "Sample pet");
  });

export const resultCommand = Command.make("result", resultConfig, ({ stream }) =>
  handleResult({ stream }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(resultConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Render structured result output"),
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
      description: "Inspect the published JSON contract",
    },
  ]),
);

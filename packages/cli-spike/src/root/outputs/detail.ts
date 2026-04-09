import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { JsonSchemaVersion, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { makeDataDocumentSchema } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

export const SamplePetDetailSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
  intakeDate: Schema.String,
  habitat: Schema.String,
});

type SamplePetDetail = typeof SamplePetDetailSchema.Type;
export const OutputsDetailOutputSchema = makeDataDocumentSchema(
  "outputs.detail",
  SamplePetDetailSchema,
);
export type OutputsDetailOutput = typeof OutputsDetailOutputSchema.Type;

const sampleItem: SamplePetDetail = {
  name: "Mochi",
  species: "cat",
  age: "2 years",
  adoptable: true,
  intakeDate: "2026-03-20T10:30:00Z",
  habitat: "showroom",
};

const detailColumns = [
  {
    key: "name",
    header: "Name",
    value: (pet: SamplePetDetail) => pet.name,
    priority: 1,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "species",
    header: "Species",
    value: (pet: SamplePetDetail) => pet.species,
    priority: 2,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "age",
    header: "Age",
    value: (pet: SamplePetDetail) => pet.age,
    priority: 3,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "adoptable",
    header: "Adoptable",
    value: (pet: SamplePetDetail) => (pet.adoptable ? "yes" : "no"),
    priority: 4,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "intakeDate",
    header: "Intake Date",
    value: (pet: SamplePetDetail) => pet.intakeDate,
    priority: 5,
    align: "left" as const,
    width: "auto" as const,
  },
  {
    key: "habitat",
    header: "Habitat",
    value: (pet: SamplePetDetail) => pet.habitat,
    priority: 6,
    align: "left" as const,
    width: "auto" as const,
  },
] as const;

const detailConfig = {
  title: Flag.string("title").pipe(Flag.withDescription("Detail view title"), Flag.optional),
} as const;

const commandMeta = spikeCommandMeta("outputs detail", { json: true });

export const handleDetail = (args: { readonly title: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: OutputsDetailOutput = {
      _version: JsonSchemaVersion,
      command: "outputs.detail",
      data: sampleItem,
    };

    if (yield* renderer.result(document, OutputsDetailOutputSchema)) {
      return;
    }

    yield* renderer.detail(sampleItem, detailColumns, Option.getOrUndefined(args.title));
  });

export const detailCommand = Command.make("detail", detailConfig, ({ title }) =>
  handleDetail({ title }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(detailConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription(
    "Render detail key-value output. JSON output includes data.name, data.species, data.intakeDate, and data.habitat.",
  ),
  Command.withExamples([
    {
      command: 'axm-spike outputs detail --title "Featured pet"',
      description: "Render a titled detail view",
    },
    {
      command: "axm-spike outputs detail --json",
      description: "Emit { _version, command, data } for one sample pet",
    },
  ]),
);

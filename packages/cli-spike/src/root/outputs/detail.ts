import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer, type DetailView } from "@axm.sh/core/unstable/cli-renderer";
import { makeCommandDocumentSchema, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

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
const SamplePetDetailView = {
  fields: {
    name: { label: "Name" },
    species: { label: "Species" },
    age: { label: "Age" },
    adoptable: {
      label: "Adoptable",
      render: (value: boolean) => (value ? "yes" : "no"),
    },
    intakeDate: { label: "Intake Date" },
    habitat: { label: "Habitat" },
  },
} as const satisfies DetailView<SamplePetDetail>;

const OutputsDetailDocumentFields = {
  data: SamplePetDetailSchema,
} satisfies Schema.Struct.Fields;

export const OutputsDetailOutputSchema = makeCommandDocumentSchema(
  "outputs.detail",
  OutputsDetailDocumentFields,
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

const detailConfig = {
  title: Flag.string("title").pipe(Flag.withDescription("Detail view title"), Flag.optional),
} as const;

export const handleDetail = (args: { readonly title: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    if (
      yield* renderer.document("outputs.detail", { data: sampleItem }, OutputsDetailDocumentFields)
    ) {
      return;
    }

    yield* renderer.detail(sampleItem, SamplePetDetailView, Option.getOrUndefined(args.title));
  });

export const detailCommand = Command.make("detail", detailConfig, ({ title }) =>
  handleDetail({ title }).pipe(withRuntime("outputs detail")),
).pipe(
  withArgvTracking(detailConfig),
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

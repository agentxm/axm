import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

interface SamplePetDetail {
  readonly name: string;
  readonly species: string;
  readonly age: string;
  readonly adoptable: boolean;
  readonly intakeDate: string;
  readonly habitat: string;
}

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

const handleDetail = (args: { readonly title: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    yield* renderer.detail(sampleItem, detailColumns, Option.getOrUndefined(args.title));
  });

export const detailCommand = Command.make("detail", detailConfig, ({ title }) =>
  handleDetail({ title }).pipe(withRuntime({ command: "outputs detail" })),
).pipe(
  withArgvTracking(detailConfig),
  Command.withDescription("Render detail key-value output"),
  Command.withExamples([
    {
      command: 'axm-spike outputs detail --title "Featured pet"',
      description: "Render a titled detail view",
    },
  ]),
);

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { withRuntime } from "../../runtime.js";

interface SamplePet {
  readonly name: string;
  readonly species: string;
  readonly age: string;
  readonly adoptable: boolean;
}

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

const handleTable = (args: { readonly caption: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    yield* renderer.table(samplePets, tableColumns, Option.getOrUndefined(args.caption));
  });

export const tableCommand = Command.make("table", tableConfig, ({ caption }) =>
  handleTable({ caption }).pipe(withRuntime({ command: "outputs table" })),
).pipe(
  withArgvTracking(tableConfig),
  Command.withDescription("Render table data"),
  Command.withExamples([
    {
      command: 'axm-spike outputs table --caption "Adoptable pets"',
      description: "Render a table with a caption",
    },
  ]),
);

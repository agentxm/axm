import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
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

export const tableCommand = Command.make("table", tableConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.table(
        samplePets,
        [
          {
            key: "name",
            header: "Name",
            value: (s: SamplePet) => s.name,
            priority: 1,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "species",
            header: "Species",
            value: (s: SamplePet) => s.species,
            priority: 2,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "age",
            header: "Age",
            value: (s: SamplePet) => s.age,
            priority: 3,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "adoptable",
            header: "Adoptable",
            value: (s: SamplePet) => (s.adoptable ? "yes" : "no"),
            priority: 4,
            align: "left" as const,
            width: "auto" as const,
          },
        ],
        Option.getOrUndefined(config.caption),
      );
    }),
    { command: "outputs table" },
  ),
).pipe(Command.withDescription("Demo table data display"));

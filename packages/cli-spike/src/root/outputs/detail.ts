import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
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

const detailConfig = {
  title: Flag.string("title").pipe(Flag.withDescription("Detail view title"), Flag.optional),
} as const;

export const detailCommand = Command.make("detail", detailConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.detail(
        sampleItem,
        [
          {
            key: "name",
            header: "Name",
            value: (s: SamplePetDetail) => s.name,
            priority: 1,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "species",
            header: "Species",
            value: (s: SamplePetDetail) => s.species,
            priority: 2,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "age",
            header: "Age",
            value: (s: SamplePetDetail) => s.age,
            priority: 3,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "adoptable",
            header: "Adoptable",
            value: (s: SamplePetDetail) => (s.adoptable ? "yes" : "no"),
            priority: 4,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "intakeDate",
            header: "Intake Date",
            value: (s: SamplePetDetail) => s.intakeDate,
            priority: 5,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "habitat",
            header: "Habitat",
            value: (s: SamplePetDetail) => s.habitat,
            priority: 6,
            align: "left" as const,
            width: "auto" as const,
          },
        ],
        Option.getOrUndefined(config.title),
      );
    }),
    { command: "outputs detail" },
  ),
).pipe(Command.withDescription("Demo detail key-value display"));

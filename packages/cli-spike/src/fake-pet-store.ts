import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/ServiceMap";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

export const FakePetRecordSchema = Schema.Struct({
  _version: Schema.Literal(1),
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
  habitat: Schema.Literals(["showroom", "foster"] as const),
});
export type FakePetRecord = typeof FakePetRecordSchema.Type;

const FAKE_PETS: ReadonlyArray<FakePetRecord> = [
  {
    _version: 1,
    name: "Mochi",
    species: "cat",
    age: "2 years",
    adoptable: true,
    habitat: "showroom",
  },
  {
    _version: 1,
    name: "Pickles",
    species: "dog",
    age: "4 months",
    adoptable: true,
    habitat: "showroom",
  },
  {
    _version: 1,
    name: "Juniper",
    species: "rabbit",
    age: "1 year",
    adoptable: false,
    habitat: "foster",
  },
];

export interface FakePetStoreService {
  readonly listPets: (
    habitat: "showroom" | "foster",
  ) => Effect.Effect<ReadonlyArray<FakePetRecord>>;
}

export class FakePetStore extends ServiceMap.Service<FakePetStore, FakePetStoreService>()(
  "@axm.sh/cli-spike/FakePetStore",
) {}

export const FakePetStoreLive = Layer.effect(
  FakePetStore,
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    return {
      listPets: (habitat) =>
        renderer.withSpinner(
          `FakePetStore: preparing ${habitat} demo pets`,
          (spinner) =>
            Effect.gen(function* () {
              yield* spinner.update(`Filtering ${habitat} demo pets`);
              yield* renderer.info(`FakePetStore: listing ${habitat} demo pets`);

              return FAKE_PETS.filter((pet) => pet.habitat === habitat);
            }),
          { successMessage: "Fake pets ready" },
        ),
    } satisfies FakePetStoreService;
  }),
);

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";

export const FakePetRecordSchema = Schema.Struct({
  name: Schema.String,
  species: Schema.String,
  age: Schema.String,
  adoptable: Schema.Boolean,
  habitat: Schema.Literals(["showroom", "foster"] as const),
});

export type FakePetRecord = typeof FakePetRecordSchema.Type;
export type FakePetHabitat = FakePetRecord["habitat"];

export interface RegisterPetRequest {
  readonly name: string;
  readonly species: Option.Option<string>;
  readonly tags: Option.Option<ReadonlyArray<string>>;
}

export interface RegisteredPet {
  readonly name: string;
  readonly species: string;
  readonly tags: ReadonlyArray<string>;
}

export interface ResolveIntakeRequest {
  readonly source: string;
  readonly habitat: FakePetHabitat;
  readonly requestedPets: ReadonlyArray<string>;
  readonly all: boolean;
}

export interface AdoptionPlan {
  readonly pet: FakePetRecord;
  readonly blocker: Option.Option<string>;
}

export interface AdoptionOutcome {
  readonly pet: FakePetRecord;
  readonly forced: boolean;
}

const FAKE_PETS: ReadonlyArray<FakePetRecord> = [
  {
    name: "Mochi",
    species: "cat",
    age: "2 years",
    adoptable: true,
    habitat: "showroom",
  },
  {
    name: "Pickles",
    species: "dog",
    age: "4 months",
    adoptable: true,
    habitat: "showroom",
  },
  {
    name: "Juniper",
    species: "rabbit",
    age: "1 year",
    adoptable: false,
    habitat: "foster",
  },
];

const findPetByName = (name: string): Option.Option<FakePetRecord> =>
  Option.fromUndefinedOr(
    FAKE_PETS.find((pet) => pet.name.toLowerCase() === name.trim().toLowerCase()),
  );

const getPetByName = (name: string) =>
  Effect.fromOption(findPetByName(name)).pipe(
    Effect.mapError(() =>
      makeAppError({
        code: "not_found",
        detail: `No sample pet named '${name}' exists`,
        breadcrumbs: [
          {
            description: "Use `axm-spike pets list` to inspect the available sample pets.",
          },
        ],
      }),
    ),
  );

const inferSpecies = (name: string): string =>
  Option.match(findPetByName(name), {
    onNone: () => "unknown",
    onSome: (pet) => pet.species,
  });

const petsInHabitat = (habitat: FakePetHabitat): ReadonlyArray<FakePetRecord> =>
  FAKE_PETS.filter((pet) => pet.habitat === habitat);

const planAdoption = (petName: string) =>
  Effect.gen(function* () {
    const pet = yield* getPetByName(petName);

    return {
      pet,
      blocker: pet.adoptable
        ? Option.none()
        : Option.some(`${pet.name} is not currently marked adoptable`),
    } satisfies AdoptionPlan;
  });

export class FakePetStore extends ServiceMap.Service<
  FakePetStore,
  {
    readonly listPets: (habitat: FakePetHabitat) => Effect.Effect<ReadonlyArray<FakePetRecord>>;
    readonly resolveIntake: (
      request: ResolveIntakeRequest,
    ) => Effect.Effect<ReadonlyArray<string>, ReturnType<typeof makeAppError>>;
    readonly registerPet: (
      request: RegisterPetRequest,
    ) => Effect.Effect<RegisteredPet, ReturnType<typeof makeAppError>>;
    readonly planAdoption: (
      petName: string,
    ) => Effect.Effect<AdoptionPlan, ReturnType<typeof makeAppError>>;
    readonly adoptPet: (
      petName: string,
      force: boolean,
    ) => Effect.Effect<AdoptionOutcome, ReturnType<typeof makeAppError>>;
  }
>()("@agentxm/client-spike/fake-pet-store/FakePetStore") {}

export const FakePetStoreLive = Layer.succeed(FakePetStore, {
  listPets: (habitat) => Effect.succeed(petsInHabitat(habitat)),

  resolveIntake: (request) =>
    Effect.gen(function* () {
      const candidates = petsInHabitat(request.habitat).map((pet) => pet.name);

      if (request.requestedPets.length > 0) {
        return yield* Effect.forEach(request.requestedPets, (petName) =>
          candidates.includes(petName)
            ? Effect.succeed(petName)
            : Effect.fail(
                makeAppError({
                  code: "not_found",
                  detail: `No ${request.habitat} sample pet named '${petName}' exists`,
                  breadcrumbs: [
                    {
                      description: "Choose one of the pets returned by `axm-spike pets list`.",
                    },
                  ],
                }),
              ),
        );
      }

      return request.all ? candidates : candidates.slice(0, 2);
    }),

  registerPet: (request) =>
    Effect.succeed({
      name: request.name,
      species: Option.getOrElse(request.species, () => inferSpecies(request.name)),
      tags: Option.getOrElse(request.tags, () => []),
    }),

  planAdoption,

  adoptPet: (petName, force) =>
    Effect.gen(function* () {
      const plan = yield* planAdoption(petName);

      if (Option.isSome(plan.blocker) && !force) {
        return yield* makeAppError({
          code: "conflict",
          detail: plan.blocker.value,
          breadcrumbs: [
            {
              description:
                "Pass `--force` to override the blocker in this demo, or choose an adoptable pet.",
            },
          ],
        });
      }

      return {
        pet: plan.pet,
        forced: Option.isSome(plan.blocker),
      } satisfies AdoptionOutcome;
    }),
});

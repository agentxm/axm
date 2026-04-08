// ==========================================================================
// list.ts — Reference pattern for INSTANT commands using CliRenderer
//
// Demonstrates the idiomatic command structure with @axm.sh/core services:
//   1. Fetch data via services
//   2. Format and emit output via CliRenderer service
//   3. withRuntime() provides CliRenderer + CliPrompt layers
// ==========================================================================
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { type FakePetRecord, FakePetStore } from "../../fake-pet-store.js";
import { withRuntime } from "../../runtime.js";

// ---------------------------------------------------------------------------
// Text renderer — human-friendly table for TTY output
//
// Uses renderer.raw() intentionally to demonstrate the escape hatch for
// custom-formatted output. See CliRenderer.table() for the canonical
// column-based data display pattern.
// ---------------------------------------------------------------------------

const renderText = (pets: ReadonlyArray<FakePetRecord>): string => {
  if (pets.length === 0) return "No pets available.";

  const header = `${"Name".padEnd(16)} ${"Species".padEnd(12)} ${"Age".padEnd(10)} ${"Adoptable".padEnd(10)} Habitat`;
  const separator = "\u2500".repeat(header.length);
  const rows = pets.map(
    (pet) =>
      `${pet.name.padEnd(16)} ${pet.species.padEnd(12)} ${pet.age.padEnd(10)} ${(pet.adoptable ? "yes" : "no").padEnd(10)} ${pet.habitat}`,
  );
  return [header, separator, ...rows].join("\n");
};

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const listConfig = {
  habitat: Flag.choice("habitat", ["showroom", "foster"] as const).pipe(
    Flag.withDescription("Pet habitat to inspect"),
    Flag.withDefault("showroom" as const),
  ),
  species: Flag.string("species").pipe(Flag.withDescription("Filter by species"), Flag.atLeast(0)),
} as const;

export const listCommand = Command.make("list", listConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const fakePetStore = yield* FakePetStore;
      const pets = yield* fakePetStore.listPets(config.habitat);
      const filteredPets =
        config.species.length === 0
          ? pets
          : pets.filter((pet) => config.species.includes(pet.species));

      yield* renderer.raw(renderText(filteredPets));
    }),
    { command: "pets list" },
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List sample pets"),
  Command.withExamples([
    { command: "axm-spike pets list", description: "List showroom pets" },
    {
      command: "axm-spike pets list --habitat foster",
      description: "List foster pets",
    },
    {
      command: "axm-spike pets list --species cat",
      description: "Filter pets by species",
    },
  ]),
);

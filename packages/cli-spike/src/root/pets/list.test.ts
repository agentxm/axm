import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { FakePetStoreLive } from "../../fake-pet-store.js";
import { handleList, PetsListOutputSchema } from "./list.js";

const decodePetsListOutput = Schema.decodeUnknownSync(PetsListOutputSchema);

const expectDefined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
};

describe("pets list handler", () => {
  it.effect("emits the published items document in machine mode", () => {
    const { layer, state } = TestMachineRenderer.make();

    return Effect.gen(function* () {
      yield* handleList({ habitat: "showroom", species: [] }).pipe(
        Effect.provide(Layer.mergeAll(FakePetStoreLive, layer)),
      );

      const result = expectDefined(state.results[0], "Expected one machine result");
      const output = decodePetsListOutput(result.data);

      expect(output.command).toBe("pets.list");
      expect(output.count).toBe(2);
      expect(output.items.map((pet) => pet.name)).toEqual(["Mochi", "Pickles"]);
      expect(state.tables).toHaveLength(0);
    });
  });

  it.effect("renders a table in text mode when machine output is not consumed", () => {
    const { layer, state } = TestRenderer.make();

    return Effect.gen(function* () {
      yield* handleList({ habitat: "foster", species: [] }).pipe(
        Effect.provide(Layer.mergeAll(FakePetStoreLive, layer)),
      );

      expect(state.tables).toHaveLength(1);
      expect(state.tables[0]?.caption).toBe("foster sample pets");
      expect(state.tables[0]?.items).toHaveLength(1);
      expect(state.tables[0]?.items[0]).toMatchObject({ name: "Juniper" });
    });
  });
});

import { TestMachineRenderer, TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { handleResult, OutputsResultOutputSchema } from "./result.js";

const decodeOutputsResult = Schema.decodeUnknownSync(OutputsResultOutputSchema);

const expectDefined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
};

describe("outputs result handler", () => {
  it.effect("emits a stable single-item document in machine mode", () => {
    const { layer, state } = TestMachineRenderer.make();

    return Effect.gen(function* () {
      yield* handleResult({ stream: false }).pipe(Effect.provide(layer));

      const result = expectDefined(state.results[0], "Expected one machine result");
      const output = decodeOutputsResult(result.data);

      expect(output.count).toBe(1);
      expect(output.data.kind).toBe("single");
      if (output.data.kind !== "single") {
        throw new Error("Expected the single-item result variant");
      }
      expect(output.data.item.name).toBe("Mochi");
      expect(state.details).toHaveLength(0);
    });
  });

  it.effect("emits a stable list document in machine mode", () => {
    const { layer, state } = TestMachineRenderer.make();

    return Effect.gen(function* () {
      yield* handleResult({ stream: true }).pipe(Effect.provide(layer));

      const result = expectDefined(state.results[0], "Expected one machine result");
      const output = decodeOutputsResult(result.data);

      expect(output.count).toBe(3);
      expect(output.data.kind).toBe("list");
      if (output.data.kind !== "list") {
        throw new Error("Expected the list result variant");
      }
      expect(output.data.items[2]?.name).toBe("Juniper");
      expect(state.tables).toHaveLength(0);
    });
  });

  it.effect("renders a table in text mode for stream output", () => {
    const { layer, state } = TestRenderer.make();

    return Effect.gen(function* () {
      yield* handleResult({ stream: true }).pipe(Effect.provide(layer));

      expect(state.tables).toHaveLength(1);
      expect(state.tables[0]?.caption).toBe("Sample pets");
      expect(state.tables[0]?.items).toHaveLength(3);
    });
  });
});

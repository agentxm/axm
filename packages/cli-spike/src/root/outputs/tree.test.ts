import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { handleTree, OutputsTreeOutputSchema } from "./tree.js";

const decodeOutputsTree = Schema.decodeUnknownSync(OutputsTreeOutputSchema);

const expectDefined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
};

describe("outputs tree handler", () => {
  it.effect("emits the recursive tree document in machine mode", () => {
    const { layer, state } = TestMachineRenderer.make();

    return Effect.gen(function* () {
      yield* handleTree({ title: Option.none() }).pipe(Effect.provide(layer));

      const result = expectDefined(state.results[0], "Expected one machine result");
      const output = decodeOutputsTree(result.data);

      expect(output.data.roots[0]?.name).toBe("packages");
      expect(output.data.roots[0]?.children?.[1]?.name).toBe("cli");
      expect(output.data.roots[0]?.children?.[2]?.children?.[1]?.name).toBe("package.json");
      expect(state.trees).toHaveLength(0);
    });
  });

  it.effect("renders the tree in text mode when machine output is not consumed", () => {
    const { layer, state } = TestRenderer.make();

    return Effect.gen(function* () {
      yield* handleTree({ title: Option.some("Workspace") }).pipe(Effect.provide(layer));

      expect(state.trees).toHaveLength(1);
      expect(state.trees[0]?.title).toBe("Workspace");
      expect(state.trees[0]?.roots).toHaveLength(3);
    });
  });
});

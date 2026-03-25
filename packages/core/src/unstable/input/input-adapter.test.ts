import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Input } from "./input.js";
import { InputAdapter } from "./input-adapter.js";
import { makeTestPrompt } from "../cli-prompt/cli-prompt-test.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InputAdapter", () => {
  it.effect("text delegates to CliPrompt.text", () => {
    const [promptLayer, state] = makeTestPrompt({ textResponses: ["alice"] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.text({ message: "Name?" });
      expect(result).toBe("alice");
      expect(state.textCalls).toHaveLength(1);
      expect(state.textCalls[0]?.message).toBe("Name?");
    }).pipe(Effect.provide(layer));
  });

  it.effect("password delegates to CliPrompt.password", () => {
    const [promptLayer, state] = makeTestPrompt({ passwordResponses: ["secret"] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.password({ message: "Password?" });
      expect(result).toBe("secret");
      expect(state.passwordCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("confirm delegates to CliPrompt.confirm", () => {
    const [promptLayer, state] = makeTestPrompt({ confirmResponses: [true] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.confirm({ message: "Continue?" });
      expect(result).toBe(true);
      expect(state.confirmCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("select delegates to CliPrompt.select", () => {
    const [promptLayer, state] = makeTestPrompt({ selectResponses: ["opt1"] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.select({
        message: "Pick:",
        options: [
          { value: "opt1", label: "One" },
          { value: "opt2", label: "Two" },
        ],
      });
      expect(result).toBe("opt1");
      expect(state.selectCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("multiselect delegates to CliPrompt.multiselect", () => {
    const [promptLayer, state] = makeTestPrompt({ multiselectResponses: [["a", "c"]] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.multiselect({
        message: "Pick many:",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ],
      });
      expect(result).toEqual(["a", "c"]);
      expect(state.multiselectCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("groupMultiselect delegates to CliPrompt.groupMultiselect", () => {
    const [promptLayer, state] = makeTestPrompt({ groupMultiselectResponses: [["a", "b"]] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.groupMultiselect({
        message: "Pick groups:",
        options: {
          group1: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      });
      expect(result).toEqual(["a", "b"]);
      expect(state.groupMultiselectCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("selectKey delegates to CliPrompt.selectKey", () => {
    const [promptLayer, state] = makeTestPrompt({ selectKeyResponses: ["y"] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.selectKey({
        message: "Choose:",
        options: [
          { value: "y" as const, label: "Yes" },
          { value: "n" as const, label: "No" },
        ],
      });
      expect(result).toBe("y");
      expect(state.selectKeyCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("autocomplete delegates to CliPrompt.autocomplete", () => {
    const [promptLayer, state] = makeTestPrompt({ autocompleteResponses: ["match"] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.autocomplete({
        message: "Search:",
        options: [{ value: "match", label: "Match" }],
      });
      expect(result).toBe("match");
      expect(state.autocompleteCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("autocompleteMultiselect delegates to CliPrompt.autocompleteMultiselect", () => {
    const [promptLayer, state] = makeTestPrompt({
      autocompleteMultiselectResponses: [["x", "y"]],
    });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.autocompleteMultiselect({
        message: "Search many:",
        options: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
      });
      expect(result).toEqual(["x", "y"]);
      expect(state.autocompleteMultiselectCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("path delegates to CliPrompt.path", () => {
    const [promptLayer, state] = makeTestPrompt({ pathResponses: ["/usr/local"] });
    const layer = Layer.provide(InputAdapter, promptLayer);
    return Effect.gen(function* () {
      const input = yield* Input;
      const result = yield* input.path({ message: "Path?" });
      expect(result).toBe("/usr/local");
      expect(state.pathCalls).toHaveLength(1);
    }).pipe(Effect.provide(layer));
  });
});

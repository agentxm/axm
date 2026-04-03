import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { CliPrompt } from "./cli-prompt.js";
import { makeTestPrompt } from "./cli-prompt-test.js";

describe("makeTestPrompt", () => {
  describe("canned responses", () => {
    it.effect("text returns canned string", () => {
      const [layer] = makeTestPrompt({ textResponses: ["hello"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.text({ message: "Name?" });
        expect(result).toBe("hello");
      }).pipe(Effect.provide(layer));
    });

    it.effect("password returns canned string", () => {
      const [layer] = makeTestPrompt({ passwordResponses: ["secret"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.password({ message: "Password?" });
        expect(result).toBe("secret");
      }).pipe(Effect.provide(layer));
    });

    it.effect("confirm returns canned boolean", () => {
      const [layer] = makeTestPrompt({ confirmResponses: [true] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.confirm({ message: "Continue?" });
        expect(result).toBe(true);
      }).pipe(Effect.provide(layer));
    });

    it.effect("select returns canned value", () => {
      const [layer] = makeTestPrompt({ selectResponses: ["opt1"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.select({
          message: "Pick:",
          options: [
            { value: "opt1", label: "One" },
            { value: "opt2", label: "Two" },
          ],
        });
        expect(result).toBe("opt1");
      }).pipe(Effect.provide(layer));
    });

    it.effect("multiselect returns canned array", () => {
      const [layer] = makeTestPrompt({ multiselectResponses: [["a", "c"]] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.multiselect({
          message: "Pick many:",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
            { value: "c", label: "C" },
          ],
        });
        expect(result).toEqual(["a", "c"]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("path returns canned string", () => {
      const [layer] = makeTestPrompt({ pathResponses: ["/usr/local"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.path({ message: "Path?" });
        expect(result).toBe("/usr/local");
      }).pipe(Effect.provide(layer));
    });

    it.effect("selectKey returns canned string", () => {
      const [layer] = makeTestPrompt({ selectKeyResponses: ["y"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.selectKey({
          message: "Choose:",
          options: [
            { value: "y" as const, label: "Yes" },
            { value: "n" as const, label: "No" },
          ],
        });
        expect(result).toBe("y");
      }).pipe(Effect.provide(layer));
    });

    it.effect("autocomplete returns canned value", () => {
      const [layer] = makeTestPrompt({ autocompleteResponses: ["match"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.autocomplete({
          message: "Search:",
          options: [{ value: "match", label: "Match" }],
        });
        expect(result).toBe("match");
      }).pipe(Effect.provide(layer));
    });

    it.effect("autocompleteMultiselect returns canned array", () => {
      const [layer] = makeTestPrompt({ autocompleteMultiselectResponses: [["x", "y"]] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.autocompleteMultiselect({
          message: "Search many:",
          options: [
            { value: "x", label: "X" },
            { value: "y", label: "Y" },
          ],
        });
        expect(result).toEqual(["x", "y"]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("groupMultiselect returns canned array", () => {
      const [layer] = makeTestPrompt({ groupMultiselectResponses: [["a", "b"]] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.groupMultiselect({
          message: "Pick groups:",
          options: {
            group1: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        });
        expect(result).toEqual(["a", "b"]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("multiselect matches structurally equal object values", () => {
      const [layer] = makeTestPrompt({
        multiselectResponses: [[{ id: "commit" }, { id: "review-pr" }]],
      });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        const result = yield* prompt.multiselect({
          message: "Pick many:",
          options: [
            { value: { id: "commit" }, label: "Commit" },
            { value: { id: "review-pr" }, label: "Review PR" },
          ],
        });
        expect(result).toEqual([{ id: "commit" }, { id: "review-pr" }]);
      }).pipe(Effect.provide(layer));
    });
  });

  describe("queue consumption", () => {
    it.effect("pops responses in order", () => {
      const [layer] = makeTestPrompt({ textResponses: ["first", "second", "third"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        expect(yield* prompt.text({ message: "1" })).toBe("first");
        expect(yield* prompt.text({ message: "2" })).toBe("second");
        expect(yield* prompt.text({ message: "3" })).toBe("third");
      }).pipe(Effect.provide(layer));
    });

    it.effect("confirm pops in order", () => {
      const [layer] = makeTestPrompt({ confirmResponses: [true, false, true] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        expect(yield* prompt.confirm({ message: "1" })).toBe(true);
        expect(yield* prompt.confirm({ message: "2" })).toBe(false);
        expect(yield* prompt.confirm({ message: "3" })).toBe(true);
      }).pipe(Effect.provide(layer));
    });
  });

  describe("call recording", () => {
    it.effect("records text calls with opts", () => {
      const [layer, state] = makeTestPrompt({ textResponses: ["val"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        yield* prompt.text({ message: "Name?", placeholder: "type here" });
        expect(state.textCalls).toHaveLength(1);
        expect(state.textCalls[0]).toEqual({ message: "Name?", placeholder: "type here" });
      }).pipe(Effect.provide(layer));
    });

    it.effect("records confirm calls", () => {
      const [layer, state] = makeTestPrompt({ confirmResponses: [true] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        yield* prompt.confirm({ message: "Sure?", active: "Yes", inactive: "No" });
        expect(state.confirmCalls).toHaveLength(1);
        expect(state.confirmCalls[0]).toEqual({
          message: "Sure?",
          active: "Yes",
          inactive: "No",
        });
      }).pipe(Effect.provide(layer));
    });

    it.effect("records select calls", () => {
      const opts = {
        message: "Pick:",
        options: [{ value: "a", label: "A" }],
      };
      const [layer, state] = makeTestPrompt({ selectResponses: ["a"] });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        yield* prompt.select(opts);
        expect(state.selectCalls).toHaveLength(1);
        expect(state.selectCalls[0]).toEqual(opts);
      }).pipe(Effect.provide(layer));
    });

    it.effect("records multiple different prompt calls", () => {
      const [layer, state] = makeTestPrompt({
        textResponses: ["alice"],
        passwordResponses: ["secret"],
        confirmResponses: [true],
      });
      return Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        yield* prompt.text({ message: "Name?" });
        yield* prompt.password({ message: "Password?" });
        yield* prompt.confirm({ message: "Done?" });
        expect(state.textCalls).toHaveLength(1);
        expect(state.passwordCalls).toHaveLength(1);
        expect(state.confirmCalls).toHaveLength(1);
      }).pipe(Effect.provide(layer));
    });
  });

  describe("empty queue failure", () => {
    it.effect("dies when text queue is empty", () =>
      Effect.gen(function* () {
        const [layer] = makeTestPrompt({ textResponses: [] });
        const exit = yield* Effect.gen(function* () {
          const prompt = yield* CliPrompt;
          return yield* prompt.text({ message: "Name?" });
        }).pipe(Effect.provide(layer), Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const die = exit.cause.reasons.find(Cause.isDieReason);
          expect(die).toBeDefined();
          expect(String(die?.defect)).toContain("TestPrompt");
          expect(String(die?.defect)).toContain("text");
        }
      }),
    );

    it.effect("dies when confirm queue is empty", () =>
      Effect.gen(function* () {
        const [layer] = makeTestPrompt({ confirmResponses: [] });
        const exit = yield* Effect.gen(function* () {
          const prompt = yield* CliPrompt;
          return yield* prompt.confirm({ message: "Sure?" });
        }).pipe(Effect.provide(layer), Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const die = exit.cause.reasons.find(Cause.isDieReason);
          expect(die).toBeDefined();
          expect(String(die?.defect)).toContain("TestPrompt");
          expect(String(die?.defect)).toContain("confirm");
        }
      }),
    );

    it.effect("dies when queue is exhausted after valid responses", () =>
      Effect.gen(function* () {
        const [layer] = makeTestPrompt({ textResponses: ["one"] });
        const exit = yield* Effect.gen(function* () {
          const prompt = yield* CliPrompt;
          yield* prompt.text({ message: "First" });
          return yield* prompt.text({ message: "Second" });
        }).pipe(Effect.provide(layer), Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const die = exit.cause.reasons.find(Cause.isDieReason);
          expect(die).toBeDefined();
          expect(String(die?.defect)).toContain("queue is empty");
        }
      }),
    );

    it.effect("dies when no config provided and any prompt is called", () =>
      Effect.gen(function* () {
        const [layer] = makeTestPrompt();
        const exit = yield* Effect.gen(function* () {
          const prompt = yield* CliPrompt;
          return yield* prompt.text({ message: "Name?" });
        }).pipe(Effect.provide(layer), Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
      }),
    );
  });
});

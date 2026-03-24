import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as ServiceMap from "effect/ServiceMap";
import { describe, expect, it } from "vitest";
import { Input } from "./input.js";
import { InputStructured } from "./input-structured.js";

const firstFailure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined;

describe("InputStructured", () => {
  const methods = [
    { name: "text", call: (input: ServiceShape) => input.text({ message: "Enter:" }) },
    { name: "password", call: (input: ServiceShape) => input.password({ message: "Secret:" }) },
    { name: "confirm", call: (input: ServiceShape) => input.confirm({ message: "Continue?" }) },
    {
      name: "select",
      call: (input: ServiceShape) => input.select({ message: "Pick:", options: [{ value: "a" }] }),
    },
    {
      name: "multiselect",
      call: (input: ServiceShape) =>
        input.multiselect({ message: "Pick:", options: [{ value: "a" }] }),
    },
    {
      name: "groupMultiselect",
      call: (input: ServiceShape) =>
        input.groupMultiselect({ message: "Pick:", options: { group: [{ value: "a" }] } }),
    },
    {
      name: "selectKey",
      call: (input: ServiceShape) =>
        input.selectKey({ message: "Choose:", options: [{ value: "y" as const }] }),
    },
    {
      name: "autocomplete",
      call: (input: ServiceShape) =>
        input.autocomplete({ message: "Search:", options: [{ value: "a" }] }),
    },
    {
      name: "autocompleteMultiselect",
      call: (input: ServiceShape) =>
        input.autocompleteMultiselect({ message: "Search:", options: [{ value: "a" }] }),
    },
    { name: "path", call: (input: ServiceShape) => input.path({ message: "Path:" }) },
  ] as const;

  type ServiceShape = ServiceMap.Service.Shape<typeof Input>;

  for (const { name, call } of methods) {
    it(`${name} fails with PROMPT_IN_STRUCTURED_OUTPUT`, async () => {
      const program = Effect.gen(function* () {
        const input = yield* Input;
        return yield* call(input);
      }).pipe(Effect.provide(InputStructured));
      const exit = await Effect.runPromiseExit(program);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = firstFailure(exit);
        expect(error).toMatchObject({
          code: "PROMPT_IN_STRUCTURED_OUTPUT",
        });
      }
    });
  }
});

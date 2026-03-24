import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeAppError } from "../app-error/index.js";
import { Input } from "./input.js";

const fail = (promptType: string) =>
  Effect.fail(
    makeAppError({
      code: "PROMPT_IN_STRUCTURED_OUTPUT",
      what: `Interactive ${promptType} prompt cannot be used with structured output`,
      howToFix:
        "Pass the equivalent flag to provide this value non-interactively, or remove --output-format",
    }),
  );

export const InputStructured: Layer.Layer<Input> = Layer.succeed(Input, {
  text: () => fail("text"),
  password: () => fail("password"),
  confirm: () => fail("confirm"),
  select: () => fail("select"),
  multiselect: () => fail("multiselect"),
  groupMultiselect: () => fail("group multiselect"),
  selectKey: () => fail("select key"),
  autocomplete: () => fail("autocomplete"),
  autocompleteMultiselect: () => fail("autocomplete multiselect"),
  path: () => fail("path"),
});

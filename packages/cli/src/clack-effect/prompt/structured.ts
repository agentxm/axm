import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackPrompt, type ClackPromptService } from "./service.js";
import { makeAppError } from "../../app-error/index.js";

const fail = (promptType: string) =>
  Effect.fail(
    makeAppError({
      code: "PROMPT_IN_STRUCTURED_OUTPUT",
      what: `Interactive ${promptType} prompt cannot be used with structured output`,
      howToFix:
        "Pass the equivalent flag to provide this value non-interactively, or remove --output-format",
    }),
  );

const makeStructuredClackPromptService = (): ClackPromptService => ({
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

export const ClackPromptStructured: Layer.Layer<ClackPrompt> = Layer.succeed(
  ClackPrompt,
  makeStructuredClackPromptService(),
);

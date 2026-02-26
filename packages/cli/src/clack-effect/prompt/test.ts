import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../../prompt-cancelled.js";
import { ClackPrompt, type ClackPromptService } from "./service.js";

export type ClackPromptBehavior =
  | { readonly type: "return"; readonly value: unknown }
  | { readonly type: "cancel" };

export interface MockClackPromptService extends ClackPromptService {
  readonly calls: { method: string; config: unknown }[];
}

export function makeClackPromptTestLayer(
  behavior: ClackPromptBehavior = { type: "return", value: "" },
): [Layer.Layer<ClackPrompt>, MockClackPromptService] {
  const calls: { method: string; config: unknown }[] = [];

  const makeMethod =
    (method: string) =>
    (config: unknown): Effect.Effect<never, never, never> =>
      Effect.sync(() => {
        calls.push({ method, config });
      }).pipe(
        Effect.flatMap(() => {
          if (behavior.type === "cancel") {
            return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
          }
          return Effect.succeed(behavior.value);
        }),
      ) as Effect.Effect<never, never, never>;

  const mockService: MockClackPromptService = {
    calls,
    text: makeMethod("text"),
    password: makeMethod("password"),
    confirm: makeMethod("confirm"),
    select: makeMethod("select"),
    multiselect: makeMethod("multiselect"),
    groupMultiselect: makeMethod("groupMultiselect"),
    selectKey: makeMethod("selectKey"),
    autocomplete: makeMethod("autocomplete"),
    autocompleteMultiselect: makeMethod("autocompleteMultiselect"),
    path: makeMethod("path"),
  };

  const layer = Layer.succeed(ClackPrompt, mockService);
  return [layer, mockService];
}

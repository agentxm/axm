import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import { TextInput, type TextInputService } from "./service.js";
import type { TextInputConfig } from "./types.js";

export type TextInputBehavior =
  | { readonly type: "return"; readonly value: string }
  | { readonly type: "cancel" };

export interface MockTextInputService extends TextInputService {
  readonly calls: TextInputConfig[];
}

export function makeTextInputTestLayer(
  behavior: TextInputBehavior = { type: "return", value: "" },
): [Layer.Layer<TextInput>, MockTextInputService] {
  const calls: TextInputConfig[] = [];

  const mockService: MockTextInputService = {
    calls,
    prompt: (config) =>
      Effect.sync(() => {
        calls.push(config);
      }).pipe(
        Effect.flatMap(() => {
          if (behavior.type === "cancel") {
            return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
          }
          return Effect.succeed(behavior.value);
        }),
      ),
  };

  const layer = Layer.succeed(TextInput, mockService);
  return [layer, mockService];
}

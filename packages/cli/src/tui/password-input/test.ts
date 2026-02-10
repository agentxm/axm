import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import { PasswordInput, type PasswordInputService } from "./service.js";
import type { PasswordInputConfig } from "./types.js";

export type PasswordInputBehavior =
  | { readonly type: "return"; readonly value: string }
  | { readonly type: "cancel" };

export interface MockPasswordInputService extends PasswordInputService {
  readonly calls: PasswordInputConfig[];
}

export function makePasswordInputTestLayer(
  behavior?: PasswordInputBehavior,
): [Layer.Layer<PasswordInput>, MockPasswordInputService] {
  const calls: PasswordInputConfig[] = [];

  const mockService: MockPasswordInputService = {
    calls,
    prompt: (config) =>
      Effect.sync(() => {
        calls.push(config);
      }).pipe(
        Effect.flatMap(() => {
          const b = behavior ?? { type: "return" as const, value: "" };
          if (b.type === "cancel") {
            return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
          }
          return Effect.succeed(b.value);
        }),
      ),
  };

  const layer = Layer.succeed(PasswordInput, mockService);
  return [layer, mockService];
}

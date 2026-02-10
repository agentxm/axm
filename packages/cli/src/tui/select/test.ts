import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import { Select, type SelectService } from "./service.js";
import type { SelectConfig } from "./types.js";

export type SelectBehavior =
  | { readonly type: "return"; readonly index: number }
  | { readonly type: "cancel" };

export interface MockSelectService extends SelectService {
  readonly calls: Array<{ message: string; itemCount: number }>;
}

export function makeSelectTestLayer(
  behavior: SelectBehavior = { type: "return", index: 0 },
): [Layer.Layer<Select>, MockSelectService] {
  const calls: Array<{ message: string; itemCount: number }> = [];

  const mockService: MockSelectService = {
    calls,
    prompt: <T>(config: SelectConfig<T>) =>
      Effect.sync(() => {
        calls.push({ message: config.message, itemCount: config.items.length });
      }).pipe(
        Effect.flatMap(() => {
          if (behavior.type === "cancel") {
            return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
          }
          const item = config.items[behavior.index];
          if (item === undefined) {
            return Effect.die(
              new Error(`Test setup error: index ${String(behavior.index)} out of bounds`),
            );
          }
          return Effect.succeed(item);
        }),
      ),
  };

  const layer = Layer.succeed(Select, mockService);
  return [layer, mockService];
}

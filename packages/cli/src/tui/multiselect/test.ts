import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import { Multiselect, type MultiselectService } from "./service.js";

export type MultiselectBehavior =
  | { readonly type: "return"; readonly indices: readonly number[] }
  | { readonly type: "cancel" };

export interface MockMultiselectCall {
  readonly message: string;
  readonly itemCount: number;
}

export interface MockMultiselectService extends MultiselectService {
  readonly calls: MockMultiselectCall[];
}

export function makeMultiselectTestLayer(
  behavior?: MultiselectBehavior,
): [Layer.Layer<Multiselect>, MockMultiselectService] {
  const calls: MockMultiselectCall[] = [];

  const mockService: MockMultiselectService = {
    calls,
    prompt: (config) =>
      Effect.sync(() => {
        calls.push({ message: config.message, itemCount: config.items.length });
      }).pipe(
        Effect.flatMap(() => {
          const b = behavior ?? { type: "return" as const, indices: [] as readonly number[] };
          if (b.type === "cancel") {
            return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
          }
          const items = b.indices.map((i) => config.items[i]!);
          return Effect.succeed(items);
        }),
      ),
  };

  const layer = Layer.succeed(Multiselect, mockService);
  return [layer, mockService];
}

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import { Confirm, type ConfirmService } from "./service.js";
import type { ConfirmConfig } from "./types.js";

export type ConfirmBehavior =
  | { readonly type: "return"; readonly value: boolean }
  | { readonly type: "cancel" };

export interface MockConfirmService extends ConfirmService {
  readonly calls: ConfirmConfig[];
}

export function makeConfirmTestLayer(
  behavior: ConfirmBehavior = { type: "return", value: true },
): [Layer.Layer<Confirm>, MockConfirmService] {
  const calls: ConfirmConfig[] = [];

  const mockService: MockConfirmService = {
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

  const layer = Layer.succeed(Confirm, mockService);
  return [layer, mockService];
}

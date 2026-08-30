import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { OperationLifecycle } from "@agentxm/extension-management/unstable/plan";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { emitNoOpOperation } from "../../operation-output.js";

export const emitNoOpOutcome = <TCommand extends string>(
  command: TCommand,
  args: {
    readonly planName: string;
    readonly planDescription?: string;
    readonly message: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const lifecycle = yield* Effect.serviceOption(OperationLifecycle);
    return yield* emitNoOpOperation(command, {
      ...args,
      mode: Option.match(lifecycle, {
        onNone: () => "apply" as const,
        onSome: ({ mode }) => mode,
      }),
    });
  });

/** Classified replay data owned by one operation's lifecycle. Raw argv never enters this store. */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import type { CommandInvocation } from "@agentxm/workspace-kernel/operations";

export class OperationInvocation extends Context.Service<
  OperationInvocation,
  Ref.Ref<Option.Option<CommandInvocation>>
>()("axm.sh/cli-runtime/operation-invocation/OperationInvocation") {}

export const recordOperationInvocation = (invocation: CommandInvocation) =>
  Effect.flatMap(Effect.serviceOption(OperationInvocation), (store) =>
    Option.match(store, {
      onNone: () => Effect.void,
      onSome: (ref) => Ref.set(ref, Option.some(invocation)),
    }),
  );

/** Writers may end observation sharing without depending on any reader. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export const CurrentWorkspaceReadPhaseInvalidation = Context.Reference<
  Effect.Effect<void> | undefined
>("@agentxm/workspace-kernel/CurrentWorkspaceReadPhaseInvalidation", {
  defaultValue: () => undefined,
});

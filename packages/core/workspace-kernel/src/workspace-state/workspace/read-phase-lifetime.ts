/** Writers may end observation sharing without depending on any reader. */
import * as Context from "effect/Context";

export const CurrentWorkspaceReadPhaseInvalidation = Context.Reference<(() => void) | undefined>(
  "@agentxm/workspace-kernel/CurrentWorkspaceReadPhaseInvalidation",
  { defaultValue: () => undefined },
);

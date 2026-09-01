import * as Effect from "effect/Effect";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { workspaceSettingsPath } from "./workspace-display-paths.js";

/** Require authored package identity to agree with the selected workspace. */
export const requireAuthoredOwner = (owner: Handle) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const configured = ws.layout.owner;
    if (configured === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Set owner to ${owner} in ${workspaceSettingsPath(ws.scope)} before authoring packages`,
      });
    }
    if (configured !== owner) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Package owner ${owner} does not match workspace owner ${configured}`,
      });
    }
  });

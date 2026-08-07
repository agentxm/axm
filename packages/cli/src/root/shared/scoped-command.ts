import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { WorkspaceMutations, type WorkspaceScope } from "@agentxm/client-core/unstable/workspace";

export const commandForScope = (command: string, scope: WorkspaceScope): string =>
  scope === "user" && !command.includes("--scope") ? `${command} --scope user` : command;

export const suggestionsForScope = (
  suggestions: ReadonlyArray<SuggestedAction>,
  scope: WorkspaceScope,
): ReadonlyArray<SuggestedAction> =>
  suggestions.map((suggestion) =>
    suggestion.cmd === undefined
      ? suggestion
      : { ...suggestion, cmd: commandForScope(suggestion.cmd, scope) },
  );

export const suggestionsForCurrentWorkspace = (suggestions: ReadonlyArray<SuggestedAction>) =>
  Effect.gen(function* () {
    const workspace = yield* Effect.serviceOption(WorkspaceMutations);
    return Option.match(workspace, {
      onNone: () => suggestions,
      onSome: (ws) => suggestionsForScope(suggestions, ws.scope),
    });
  });

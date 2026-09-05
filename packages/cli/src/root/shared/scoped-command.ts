import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { AppErrorSuggestedAction } from "../../app-error/index.js";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

export const commandForScope = (command: string, scope: WorkspaceScope): string =>
  scope === "user" && !/(?:^|\s)--scope(?:\s|=|$)/.test(command)
    ? `${command} --scope user`
    : command;

export const suggestionsForScope = (
  suggestions: ReadonlyArray<AppErrorSuggestedAction>,
  scope: WorkspaceScope,
): ReadonlyArray<SuggestedAction> =>
  suggestions.map((suggestion) => {
    const { commandScope, ...publicSuggestion } = suggestion;
    return publicSuggestion.cmd === undefined || commandScope === "global"
      ? publicSuggestion
      : { ...publicSuggestion, cmd: commandForScope(publicSuggestion.cmd, scope) };
  });

export const suggestionsForCurrentWorkspace = (suggestions: ReadonlyArray<SuggestedAction>) =>
  Effect.gen(function* () {
    const workspace = yield* Effect.serviceOption(WorkspaceMutations);
    return Option.match(workspace, {
      onNone: () => suggestions,
      onSome: (ws) => suggestionsForScope(suggestions, ws.scope),
    });
  });

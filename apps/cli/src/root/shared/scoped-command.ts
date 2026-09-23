import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { FailureSuggestedAction } from "@agentxm/workspace/transitions/planning";
import { WorkspaceLocation } from "@agentxm/workspace/desired-state";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

export const commandForScope = (command: string, scope: WorkspaceScope): string =>
  scope === "user" && !/(?:^|\s)--scope(?:\s|=|$)/.test(command)
    ? `${command} --scope user`
    : command;

export const suggestionsForScope = (
  suggestions: ReadonlyArray<FailureSuggestedAction>,
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
    const location = yield* Effect.serviceOption(WorkspaceLocation);
    return Option.match(location, {
      onNone: () => suggestions,
      onSome: ({ scope }) => suggestionsForScope(suggestions, scope),
    });
  });

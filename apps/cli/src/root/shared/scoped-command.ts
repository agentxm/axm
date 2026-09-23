import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { FailureSuggestedAction } from "@agentxm/workspace/transitions/planning";
import { WorkspaceLocation } from "@agentxm/workspace/desired-state";
import { isWorkspaceFailure } from "@agentxm/workspace/reconciliation";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { AppError } from "../../app-error/index.js";
import { toAppError } from "../../app-error/conversions.js";

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

/**
 * A command's failure as the workspace it ran in reports it: a workspace
 * failure projects into its envelope, and each suggested command addresses the
 * workspace's scope unless it runs for the whole installation. Any other
 * failure passes through unchanged.
 */
export const failureForWorkspaceScope = <E>(error: E, scope: WorkspaceScope): E | AppError => {
  const envelope =
    error instanceof AppError ? error : isWorkspaceFailure(error) ? toAppError(error) : undefined;
  if (envelope === undefined) return error;
  if (envelope.suggestions === undefined) return envelope;
  return new AppError({
    code: envelope.code,
    title: envelope.title,
    detail: envelope.detail,
    ...(envelope.metadata === undefined ? {} : { metadata: envelope.metadata }),
    ...(envelope.status === undefined ? {} : { status: envelope.status }),
    ...(envelope.retryable === undefined ? {} : { retryable: envelope.retryable }),
    ...(envelope.blockedOn === undefined ? {} : { blockedOn: envelope.blockedOn }),
    ...(envelope.action === undefined ? {} : { action: envelope.action }),
    ...(envelope.problem === undefined ? {} : { problem: envelope.problem }),
    ...(envelope.inputs === undefined ? {} : { inputs: envelope.inputs }),
    suggestions: suggestionsForScope(envelope.suggestions, scope),
    cause: envelope.cause,
  });
};

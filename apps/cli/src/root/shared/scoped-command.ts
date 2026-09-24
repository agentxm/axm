/**
 * Addressing a suggested command to the workspace scope it must run in.
 *
 * A kernel suggestion spells a route and its arguments; only this application
 * knows which registered routes accept `--scope`. In a user-scope workspace a
 * suggested command is appended `--scope user` exactly when its route takes
 * the flag, it does not already carry one, and the suggestion did not declare
 * itself `global` (a command that runs for the whole installation).
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import type * as CliCommand from "effect/unstable/cli/Command";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { FailureSuggestedAction } from "@agentxm/workspace/transitions/planning";
import { WorkspaceLocation } from "@agentxm/workspace/desired-state";
import { isWorkspaceFailure } from "@agentxm/workspace/reconciliation";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { AppError } from "../../app-error/index.js";
import { toAppError } from "../../app-error/conversions.js";
import { commandFlagNames } from "../../cli-reference.js";

/**
 * The registered routes whose flags include `--scope`, each as its words after
 * `axm` joined by one space (`"skills list"`), read once from the command tree.
 */
export class ScopedRoutes extends ServiceMap.Service<
  ScopedRoutes,
  { readonly routes: ReadonlySet<string> }
>()("axm.sh/cli/root/shared/ScopedRoutes") {}

export const scopedRoutesOf = (root: CliCommand.Command.Any): ReadonlySet<string> => {
  const routes = new Set<string>();
  const walk = (command: CliCommand.Command.Any, path: ReadonlyArray<string>): void => {
    if (commandFlagNames(command).includes("scope")) routes.add(path.join(" "));
    for (const group of command.subcommands) {
      for (const child of group.commands) walk(child, [...path, child.name]);
    }
  };
  walk(root, []);
  return routes;
};

export const ScopedRoutesLive = (root: CliCommand.Command.Any): Layer.Layer<ScopedRoutes> =>
  Layer.succeed(ScopedRoutes, { routes: scopedRoutesOf(root) });

/** No route takes `--scope`: the answer where no command tree is in context. */
export const NO_SCOPED_ROUTES: ReadonlySet<string> = new Set();

const ROUTE_WORD = /^[a-z][a-z0-9-]*$/u;

/**
 * The registered scope-taking route a suggested command invokes: the longest
 * leading run of route-shaped words after `axm` that names one.
 */
const scopedRouteOf = (command: string, routes: ReadonlySet<string>): string | undefined => {
  const [executable, ...rest] = command.trim().split(/\s+/u);
  if (executable !== "axm") return undefined;
  const words: Array<string> = [];
  for (const word of rest) {
    if (!ROUTE_WORD.test(word)) break;
    words.push(word);
  }
  for (let length = words.length; length > 0; length -= 1) {
    const route = words.slice(0, length).join(" ");
    if (routes.has(route)) return route;
  }
  return undefined;
};

const carriesScope = (command: string): boolean => /(?:^|\s)--scope(?:\s|=|$)/u.test(command);

export const commandForScope = (
  command: string,
  scope: WorkspaceScope,
  routes: ReadonlySet<string>,
): string =>
  scope === "user" && !carriesScope(command) && scopedRouteOf(command, routes) !== undefined
    ? `${command} --scope user`
    : command;

export const suggestionsForScope = (
  suggestions: ReadonlyArray<FailureSuggestedAction>,
  scope: WorkspaceScope,
  routes: ReadonlySet<string>,
): ReadonlyArray<SuggestedAction> =>
  suggestions.map((suggestion) => {
    const { commandScope, ...publicSuggestion } = suggestion;
    return publicSuggestion.cmd === undefined || commandScope === "global"
      ? publicSuggestion
      : { ...publicSuggestion, cmd: commandForScope(publicSuggestion.cmd, scope, routes) };
  });

/**
 * Address suggestions to the current workspace: its scope, and the routes the
 * running command tree registers with `--scope`. Without a workspace or a
 * command tree in context nothing is addressed, and the suggestions leave
 * only their public fields behind.
 */
export const suggestionsForCurrentWorkspace = (
  suggestions: ReadonlyArray<FailureSuggestedAction>,
) =>
  Effect.gen(function* () {
    const location = yield* Effect.serviceOption(WorkspaceLocation);
    const scoped = yield* Effect.serviceOption(ScopedRoutes);
    return suggestionsForScope(
      suggestions,
      Option.match(location, { onNone: () => "project", onSome: ({ scope }) => scope }),
      Option.match(scoped, { onNone: () => NO_SCOPED_ROUTES, onSome: ({ routes }) => routes }),
    );
  });

/**
 * A command's failure as the workspace it ran in reports it: a workspace
 * failure projects into its envelope, and each suggested command addresses the
 * workspace's scope unless it runs for the whole installation. Any other
 * failure passes through unchanged.
 */
export const failureForWorkspaceScope = <E>(
  error: E,
  scope: WorkspaceScope,
  routes: ReadonlySet<string>,
): E | AppError => {
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
    suggestions: suggestionsForScope(envelope.suggestions, scope, routes),
    cause: envelope.cause,
  });
};

/**
 * What a command that can establish a workspace does when its scope has no
 * settings yet.
 *
 * Where a person can answer, first use is setup: the same questions, plan, and
 * approval `axm setup` raises, applied before the command's own work. Where
 * nobody can answer, or under a preview, it is the minimal state the command
 * needs — the agents it was given or the project names — and the instruction
 * choice stays open for setup to settle later.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  SetupWorkspace,
  WorkspaceInitializationCancelled,
} from "@agentxm/workspace-features/configuration";

import { makeAppError } from "../../app-error/index.js";
import type { ExpectedCliError } from "../../cli-runtime/index.js";
import { ExecutionDirectory } from "../../execution-directory.js";
import { coerceConfigurationFailure } from "../../feature-errors.js";
import {
  canAskUndetectedAgents,
  chooseUndetectedAgents,
  observeFirstInstallAgents,
  setupProjectionLayer,
  withWorkspace,
} from "../../runtime.js";
import { Screen, headlineDoc } from "../../screen/index.js";
import { setupTitleDoc } from "../setup/view.js";
import { formatDisplayPath } from "./display-path.js";

/** How a scope without settings came to hold a workspace. */
export type FirstUse =
  | { readonly _tag: "SetUp" }
  | { readonly _tag: "Minimal"; readonly agents: ReadonlyArray<ConfigurableAgentId> };

/** The workspace a command opens once first use is settled. */
export const firstUseWorkspace = (scope: WorkspaceScope, firstUse: FirstUse) =>
  firstUse._tag === "SetUp"
    ? { scope }
    : // No instruction choice is recorded: nobody was asked, so none was made.
      { scope, initialSettings: { agents: [...firstUse.agents] } };

const screenFailure = (cause: unknown) =>
  makeAppError({
    code: "internal",
    detail: "The workspace setup interaction could not be displayed.",
    cause,
  });

/**
 * Set the scope up as `axm setup` does, asking what it asks. Agents a request
 * names settle that question; a declined plan cancels the command that needed
 * the workspace, having written nothing.
 */
export const setUpFirstUse = (args: {
  readonly scope: WorkspaceScope;
  readonly agents: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const path = yield* Path.Path;
    const executionDirectory = yield* ExecutionDirectory;
    const prepared = yield* SetupWorkspace.prepare({
      scope: args.scope,
      ...(args.agents.length > 0 ? { agents: args.agents } : {}),
      nonInteractive: false,
      projectRoot: executionDirectory.path,
      telemetryEnabled: false,
    }).pipe(Effect.mapError(coerceConfigurationFailure));
    if (prepared._tag === "ApprovalRequired") {
      return yield* makeAppError({
        code: "internal",
        detail: "Interactive first-use setup was refused as unattended",
      });
    }
    yield* screen
      .note(
        setupTitleDoc({
          preview: false,
          where: formatDisplayPath(path, path.dirname(prepared.settingsPath)),
          scope: args.scope,
        }),
      )
      .pipe(Effect.mapError(screenFailure));
    const transition = yield* SetupWorkspace.previewOrApply(prepared).pipe(
      Effect.provide(
        setupProjectionLayer({ scope: args.scope, projectRoot: executionDirectory.path }),
      ),
      Effect.mapError(coerceConfigurationFailure),
    );
    if (transition.cancelled) {
      return yield* new WorkspaceInitializationCancelled({ message: "Setup cancelled" });
    }
    yield* screen.note(headlineDoc("ok", "Set up AXM")).pipe(Effect.mapError(screenFailure));
    const setUp: FirstUse = { _tag: "SetUp" };
    return setUp;
  });

/**
 * Open the workspace a command needs, establishing it on first use. A command
 * with nothing to ask before its workspace exists settles first use up front.
 */
export const withFirstUse =
  (args: {
    readonly scope: WorkspaceScope;
    readonly agents: ReadonlyArray<ConfigurableAgentId>;
    readonly preview: boolean;
  }) =>
  <A, R>(program: Effect.Effect<A, ExpectedCliError, R>) =>
    Effect.gen(function* () {
      const observed = yield* observeFirstInstallAgents(args.scope);
      if (observed._tag === "Established") return yield* program.pipe(withWorkspace(args.scope));
      const firstUse: FirstUse =
        (yield* canAskUndetectedAgents) && !args.preview
          ? yield* setUpFirstUse(args)
          : {
              _tag: "Minimal",
              agents:
                args.agents.length > 0
                  ? args.agents
                  : observed._tag === "Detected"
                    ? observed.agents
                    : yield* chooseUndetectedAgents(observed.detections),
            };
      return yield* program.pipe(withWorkspace(firstUseWorkspace(args.scope, firstUse)));
    });

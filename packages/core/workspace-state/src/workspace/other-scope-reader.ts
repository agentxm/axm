/**
 * The unselected scope's state, read through the same read model.
 *
 * A command that runs against one scope sometimes has to say something true
 * about the other one — which extensions of the same name the user scope also
 * configures, for instance. That read belongs to workspace state, which owns
 * both layouts and both document formats; callers never open those files
 * themselves.
 *
 * The other scope may not exist, or may be unreadable, and neither is a
 * failure: the answer is simply not determined.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { Lockfile } from "../lockfile/schema.js";
import type { Settings } from "../settings/index.js";
import { WorkspaceLocation } from "./location.js";
import { readSettingsCell, readLockfileCell } from "./state-cells.js";

export interface OtherScopeState {
  /** The scope that was inspected: the one this workspace did not select. */
  readonly scope: WorkspaceScope;
  readonly settings: Settings;
  readonly lockfile: Lockfile;
}

/**
 * The settings and lockfile of the scope this workspace did not select, or
 * `None` when that scope has no readable state.
 */
export const readOtherScopeState: Effect.Effect<
  Option.Option<OtherScopeState>,
  never,
  WorkspaceLocation | FileSystem.FileSystem | Path.Path
> = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const scope: WorkspaceScope = location.scope === "project" ? "user" : "project";
  const dir = scope === "user" ? location.userRuntimeDir : location.projectRuntimeDir;
  const settings = yield* readSettingsCell(location, dir, scope).pipe(
    Effect.orElseSucceed(() => Option.none<Settings>()),
  );
  if (Option.isNone(settings)) return Option.none<OtherScopeState>();
  const lockfile = yield* readLockfileCell(location, dir, scope).pipe(Effect.result);
  return lockfile._tag === "Failure"
    ? Option.none<OtherScopeState>()
    : Option.some({ scope, settings: settings.value, lockfile: lockfile.success });
}).pipe(Effect.withSpan("WorkspaceState.readOtherScopeState"));

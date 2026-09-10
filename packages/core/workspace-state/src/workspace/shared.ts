/**
 * State shared by the narrow workspace services of one workspace lifetime:
 * the in-process mutation mutex every writer serializes on, and the merged
 * source-host cache the settings reader fills and the settings writer
 * invalidates. Provided by the live composition; not part of the public API.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import type { SourceHostConfig } from "../settings/index.js";

export interface WorkspaceStateSharedService {
  /** Serializes every settings and lockfile mutation of one runtime. */
  readonly mutex: Semaphore.Semaphore;
  /** Merged sources, cached per workspace lifetime until a source is added. */
  readonly sourcesCache: Ref.Ref<Option.Option<ReadonlyArray<SourceHostConfig>>>;
}

export class WorkspaceStateShared extends ServiceMap.Service<
  WorkspaceStateShared,
  WorkspaceStateSharedService
>()("@agentxm/workspace-state/WorkspaceStateShared") {}

export const makeWorkspaceStateShared: Effect.Effect<WorkspaceStateSharedService> = Effect.gen(
  function* () {
    return {
      mutex: yield* Semaphore.make(1),
      sourcesCache: yield* Ref.make<Option.Option<ReadonlyArray<SourceHostConfig>>>(Option.none()),
    };
  },
);

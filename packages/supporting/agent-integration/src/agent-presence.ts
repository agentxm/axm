/**
 * Agent-presence probe: which agents are present on the machine, per scope.
 *
 * The workspace read model records presence as a scoped fact and resolves this
 * service optionally, degrading to an empty presence set when it is absent.
 * Detection is agent-surface integration, so both the port and its
 * detection-backed layer live here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { detectAgentsForScope } from "./detection.js";

/** Presence detection failed; the read model degrades to an empty set. */
export class AgentPresenceUnavailable extends Data.TaggedError("AgentPresenceUnavailable")<{
  readonly message: string;
}> {}

export interface AgentPresenceProbeService {
  readonly detect: (
    root: string,
    scope: WorkspaceScope,
  ) => Effect.Effect<ReadonlySet<AgentId>, AgentPresenceUnavailable>;
}

export class AgentPresenceProbe extends ServiceMap.Service<
  AgentPresenceProbe,
  AgentPresenceProbeService
>()("@agentxm/agent-integration/AgentPresenceProbe") {}

/** Detection-backed presence facts for the workspace read model. */
export const AgentPresenceProbeLive = Layer.effect(
  AgentPresenceProbe,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return {
      detect: (root, scope) =>
        detectAgentsForScope(root, scope).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.map((detected) => new Set<AgentId>(detected.map((agent) => agent.id))),
          Effect.mapError((error) => new AgentPresenceUnavailable({ message: error.message })),
        ),
    };
  }),
);

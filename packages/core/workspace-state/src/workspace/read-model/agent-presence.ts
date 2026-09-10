/**
 * Agent-presence probe port.
 *
 * The read model records which agents are present on the machine as a
 * scoped fact. Detection itself is agent-surface integration, so the state
 * layer declares only this optional port; the application composes an
 * implementation backed by agent detection. An absent probe degrades to an
 * empty presence set, matching the read model's existing failure
 * degradation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

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
>()("@agentxm/workspace-state/workspace/read-model/agent-presence/AgentPresenceProbe") {}

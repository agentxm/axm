/**
 * Detection-backed implementation of the read model's agent-presence port.
 *
 * Lives with the application runtime: the state layer declares the port and
 * the agent-detection integration supplies the facts, so only the
 * composition root may see both.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { detectAgentsForScope } from "../agents/detection.js";
import {
  AgentPresenceProbe,
  AgentPresenceUnavailable,
} from "../workspace/read-model/agent-presence.js";

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

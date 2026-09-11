/**
 * The workspace-facts layer over the registered projection participants, for
 * test fixtures that compose the manager layers directly.
 */

import * as Layer from "effect/Layer";

import { ProjectionParticipantsLive } from "@agentxm/extension-materialization/live";
import { WorkspaceInvariantFactsLive } from "@agentxm/workspace-projection/live";

export const workspaceInvariantFactsLive = Layer.provide(
  WorkspaceInvariantFactsLive,
  ProjectionParticipantsLive,
);

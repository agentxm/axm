/**
 * The workspace-facts layer over the registered projection participants, for
 * test fixtures that compose the manager layers directly.
 */

import * as Layer from "effect/Layer";

import { ProjectionParticipantsLive } from "@agentxm/workspace-kernel/reconciliation/live";
import { WorkspaceInvariantFactsLive } from "@agentxm/workspace-kernel/projection/live";

export const workspaceInvariantFactsLive = Layer.provide(
  WorkspaceInvariantFactsLive,
  ProjectionParticipantsLive,
);

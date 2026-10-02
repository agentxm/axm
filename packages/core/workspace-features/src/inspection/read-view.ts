import type * as Effect from "effect/Effect";
import { withMcpInspectionReadView } from "@agentxm/workspace-kernel/projection";
import { withWorkspaceReadView } from "@agentxm/workspace-kernel/workspace-state";

/** One fresh local view for a query, including its detailed native MCP facts. */
export const withInspectionReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withWorkspaceReadView(withMcpInspectionReadView(effect));

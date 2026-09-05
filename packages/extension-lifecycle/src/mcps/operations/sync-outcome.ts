import * as Effect from "effect/Effect";
import type { McpServerSyncOutcome } from "@agentxm/extension-workspace";
import { ExtensionLifecycleFailed } from "../../errors.js";

export interface AgentMcpSyncOutcome {
  readonly agentId: string;
  readonly outcome: McpServerSyncOutcome;
}

const outcomeSummary = ({ agentId, outcome }: AgentMcpSyncOutcome): string =>
  outcome._tag === "fallback"
    ? `${agentId}: fallback(${outcome.fallbackFrom}):${outcome.reason}`
    : outcome._tag === "success"
      ? `${agentId}: success`
      : `${agentId}: ${outcome.reason}`;

export const requireSuccessfulMcpSync = (
  serverName: string,
  outcomes: ReadonlyArray<AgentMcpSyncOutcome>,
): Effect.Effect<void, ExtensionLifecycleFailed> => {
  const failures = outcomes.filter(
    ({ outcome }) =>
      outcome._tag === "disabled" ||
      outcome._tag === "nothing-runnable" ||
      outcome._tag === "needs-input" ||
      outcome._tag === "misconfigured" ||
      outcome._tag === "failed",
  );
  if (failures.length === 0) return Effect.void;

  return new ExtensionLifecycleFailed({
    category: "conflict",
    detail: `MCP agent sync failed for ${serverName}: ${failures.map(outcomeSummary).join(", ")}`,
  });
};

export const mcpSyncWarnings = (
  serverName: string,
  outcomes: ReadonlyArray<AgentMcpSyncOutcome>,
): ReadonlyArray<string> => {
  const warnings = outcomes.filter(
    ({ outcome }) => outcome._tag === "fallback" || outcome._tag === "unsupported",
  );
  return warnings.length === 0
    ? []
    : [`MCP agent sync warnings for ${serverName}: ${warnings.map(outcomeSummary).join(", ")}`];
};

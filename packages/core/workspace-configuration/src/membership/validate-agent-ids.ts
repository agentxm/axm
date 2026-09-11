/**
 * Which coding-agent identifiers a membership or capability request may name.
 *
 * The configurable catalog is the whole answer: `universal` is materialized
 * for every workspace and is never a membership choice, a hosted agent is
 * installed through its vendor rather than through workspace configuration,
 * and anything else is refused before a change is planned, naming the nearest
 * supported id when one is close enough to be a typo.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import {
  HOSTED_AGENTS_BY_ID,
  HOSTED_AGENT_IDS,
  type HostedAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";
import { WorkspaceConfigurationFailed } from "../errors.js";

const configurableAgentIds = new Set<string>(CONFIGURABLE_AGENT_IDS);
const hostedAgentIds = new Set<string>(HOSTED_AGENT_IDS);

const isHostedAgentId = (id: string): id is HostedAgentId => hostedAgentIds.has(id);

const numberAt = (values: ReadonlyArray<number>, index: number): number => values[index] ?? 0;

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_value, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        numberAt(current, rightIndex) + 1,
        numberAt(previous, rightIndex + 1) + 1,
        numberAt(previous, rightIndex) + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? left.length;
};

const nearestAgentId = (input: string): string | undefined => {
  let best: { readonly id: string; readonly distance: number } | undefined;

  for (const id of CONFIGURABLE_AGENT_IDS) {
    const distance = editDistance(input, id);
    if (best === undefined || distance < best.distance) {
      best = { id, distance };
    }
  }

  if (best === undefined) return undefined;
  return best.distance <= Math.max(3, Math.floor(input.length / 2)) ? best.id : undefined;
};

export const dedupe = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.from(new Set(values));

export const validateAgentIds = (
  ids: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    for (const id of ids) {
      if (id === "universal") {
        return yield* new WorkspaceConfigurationFailed({
          category: "validation",
          detail:
            "`universal` is always materialized automatically and cannot be added or removed.",
          suggestions: [{ description: "Choose one of the configurable coding-agent IDs." }],
        });
      }

      if (isHostedAgentId(id)) {
        const agent = HOSTED_AGENTS_BY_ID[id];
        return yield* new WorkspaceConfigurationFailed({
          category: "validation",
          detail: `${agent.name} is a hosted agent and cannot be added to local workspace configuration. ${agent.installTarget.instructions}`,
          suggestions: [
            {
              description: `Open the ${agent.name} skill installation guide.`,
              url: agent.installTarget.docs,
            },
          ],
        });
      }

      if (!configurableAgentIds.has(id)) {
        const nearest = nearestAgentId(id);
        return yield* new WorkspaceConfigurationFailed({
          category: "validation",
          detail: `Unknown agent ID: ${id}`,
          suggestions: [
            nearest === undefined
              ? { description: "Inspect supported agent IDs.", cmd: "axm agents list --available" }
              : {
                  description: `Did you mean "${nearest}"?`,
                  cmd: `axm agents add ${nearest}`,
                },
          ],
        });
      }
    }

    return dedupe(ids);
  });

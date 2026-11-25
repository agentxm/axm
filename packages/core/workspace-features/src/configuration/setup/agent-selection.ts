/**
 * Which coding agents setup offers, auto-selects, and records.
 *
 * Detection suggests, configuration and explicit requests decide, and a
 * retired agent is never selected by detection alone.
 *
 * @internal
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import {
  type AgentDescriptor,
  type MaterializationTargetId,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agents/types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  detectAgentScopeResults,
  type AgentScopeDetection,
} from "@agentxm/workspace-kernel/agent-adapters";
import { recoverySwitch } from "@agentxm/workspace-kernel/operations";
import type { Settings, WorkspaceStateOptions } from "@agentxm/workspace-kernel/workspace-state";

import { configurationRefused } from "../errors.js";
import { isRetiredAgent } from "../membership/agent-lifecycle.js";
import {
  WorkspaceInitializationInteraction,
  type WorkspaceInitializationInteractionService,
} from "./initialization-interaction.js";

const SELECT_AGENTS_PROMPT_MISSING = configurationRefused({
  category: "usage",
  detail: "Interactive prompt required: Select agents to configure",
  suggestions: [{ description: "Provide WorkspaceInitializationInteraction in the runtime." }],
});

export interface SetupAgentCandidate {
  readonly id: ConfigurableAgentId;
  readonly name: string;
  readonly projectDetected: boolean;
  readonly userDetected: boolean;
  readonly state: "selected" | "suggested" | "available" | "retired";
  readonly selectionReason?: "explicit" | "project-detected" | "user-detected";
}

export interface SetupAgentSelection {
  readonly selectedAgents: ReadonlyArray<AgentDescriptor>;
  readonly candidates: ReadonlyArray<SetupAgentCandidate>;
}

const isKnownAgentId = (id: string): id is MaterializationTargetId =>
  Object.hasOwn(AGENT_DESCRIPTORS, id);

export const isKnownConfigurableAgentId = (id: string): id is ConfigurableAgentId =>
  isKnownAgentId(id) && isConfigurableAgentId(id);

const allAgentDescriptors = (
  preferredIds: ReadonlyArray<string>,
): ReadonlyArray<AgentDescriptor> => {
  // Preference sources overlap by design — configuration, detection, and the
  // suggestion name the same agent — so the offer is ordered by first
  // mention and carries each agent once.
  const preferred = [...new Set(preferredIds)].flatMap((id) =>
    isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
  );
  const preferredSet = new Set(preferred.map((agent) => agent.id));
  const remaining = Object.values(AGENT_DESCRIPTORS).filter(
    (agent) => isConfigurableAgentId(agent.id) && !preferredSet.has(agent.id),
  );
  return [...preferred, ...remaining];
};

/**
 * What a first install offers when its project names no coding agent: every
 * configurable agent once, with workstation detections first but unselected.
 */
export const undetectedAgentOffer = (detections: ReadonlyArray<AgentScopeDetection>) => {
  const userDetectedIds = detections.flatMap(({ agent, user }) =>
    user && !isRetiredAgent(agent.id) ? [agent.id] : [],
  );
  const suggestedIds: ReadonlyArray<ConfigurableAgentId> = [];
  return {
    allAgents: allAgentDescriptors(userDetectedIds),
    detectedIds: userDetectedIds,
    projectDetectedIds: [],
    userDetectedIds,
    suggestedIds,
    configuredIds: [],
  } satisfies Parameters<WorkspaceInitializationInteractionService["selectAgents"]>[0];
};

/**
 * Configured membership as a set, in selection order.
 *
 * An explicit request and a selection each reach setup as a sequence, so
 * either can name one agent more than once; the settings contract records
 * each configured agent once.
 */
export const configuredAgentIds = (
  selectedAgents: ReadonlyArray<AgentDescriptor>,
): ReadonlyArray<ConfigurableAgentId> => [
  ...new Set(
    selectedAgents.flatMap((agent) => (isConfigurableAgentId(agent.id) ? [agent.id] : [])),
  ),
];

const setupAgentCandidates = (args: {
  readonly detections: ReadonlyArray<AgentScopeDetection>;
  readonly selectedAgents: ReadonlyArray<AgentDescriptor>;
  readonly suggestedIds: ReadonlyArray<ConfigurableAgentId>;
  readonly explicit: boolean;
  readonly scope: WorkspaceScope;
}): ReadonlyArray<SetupAgentCandidate> => {
  const selectedIds = new Set(args.selectedAgents.map((agent) => agent.id));
  const suggestedIds = new Set(args.suggestedIds);
  const detectionsById = new Map(
    args.detections.map((detection) => [detection.agent.id, detection]),
  );
  const relevantIds = [
    ...args.selectedAgents.map((agent) => agent.id),
    ...args.detections.map((detection) => detection.agent.id),
    ...args.suggestedIds,
  ];

  return [...new Set(relevantIds)].flatMap((id) => {
    if (!isKnownConfigurableAgentId(id)) return [];
    const agent = AGENT_DESCRIPTORS[id];
    const detection = detectionsById.get(id);
    const projectDetected = detection?.project ?? false;
    const userDetected = detection?.user ?? false;
    const retired = isRetiredAgent(agent.id);
    const selected = selectedIds.has(id);
    const selectionReason = selected
      ? args.explicit
        ? "explicit"
        : args.scope === "project" && projectDetected
          ? "project-detected"
          : userDetected
            ? "user-detected"
            : undefined
      : undefined;
    return [
      {
        id,
        name: agent.name,
        projectDetected,
        userDetected,
        state: retired
          ? "retired"
          : selected
            ? "selected"
            : suggestedIds.has(id)
              ? "suggested"
              : "available",
        ...(selectionReason === undefined ? {} : { selectionReason }),
      } satisfies SetupAgentCandidate,
    ];
  });
};

export const selectSetupAgents = (args: {
  readonly options: WorkspaceStateOptions;
  readonly existingSettings: Settings;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const nonInteractive = args.options.nonInteractive === true;
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    const requested = args.options.agents;
    if (requested !== undefined && requested.length > 0) {
      const unrecognized = requested.filter((id) => !isKnownConfigurableAgentId(id));
      if (unrecognized.length > 0) {
        const label = unrecognized.length === 1 ? "agent" : "agents";
        return yield* configurationRefused({
          category: "validation",
          detail: `Unrecognized setup ${label}: ${unrecognized.join(", ")}`,
          suggestions: [
            {
              description: "Show available setup agents.",
              invocation: { command: ["setup"], arguments: [recoverySwitch("--help", true)] },
            },
          ],
        });
      }
    }
    const detections = yield* detectAgentScopeResults(args.workspaceRoot).pipe(
      Effect.mapError((error) =>
        error._tag === "ConfigError"
          ? error
          : configurationRefused({
              category: "internal",
              detail: `Failed to detect agents: ${error.message}`,
              cause: error,
            }),
      ),
    );
    const detectedAgents = detections.map((detection) => detection.agent);
    const autoSelectableAgents = detectedAgents.filter((agent) => !isRetiredAgent(agent.id));
    const retiredDetectedAgents = detectedAgents.filter((agent) => isRetiredAgent(agent.id));
    const detectedIds = Array.map(autoSelectableAgents, (agent) => agent.id);
    const projectDetectedIds = detections.flatMap(({ agent, project }) =>
      project && !isRetiredAgent(agent.id) ? [agent.id] : [],
    );
    const userDetectedIds = detections.flatMap(({ agent, user }) =>
      user && !isRetiredAgent(agent.id) ? [agent.id] : [],
    );
    if (requested !== undefined && requested.length > 0) {
      const selected = requested.flatMap((id) =>
        isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
      );
      return {
        selectedAgents: selected,
        candidates: setupAgentCandidates({
          detections,
          selectedAgents: selected,
          suggestedIds: [],
          explicit: true,
          scope: args.options.scope,
        }),
      } satisfies SetupAgentSelection;
    }

    if (Option.isSome(interaction)) {
      yield* interaction.value.presentAgentScan({
        detectedCount: detectedAgents.length,
        retiredAgents: retiredDetectedAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
        })),
      });
    }

    const configuredIds = args.existingSettings.agents ?? [];
    const strongDetectedIds =
      args.options.scope === "project" ? projectDetectedIds : userDetectedIds;
    const suggestedIds = configuredIds.length === 0 ? strongDetectedIds : [];
    const preferredIds = [...configuredIds, ...strongDetectedIds, ...detectedIds, ...suggestedIds];
    const defaultIds = [...new Set(configuredIds.length > 0 ? configuredIds : suggestedIds)];
    if (nonInteractive || args.options.yes === true || args.options.preview === true) {
      const selectedAgents = defaultIds.flatMap((id) =>
        isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
      );
      return {
        selectedAgents,
        candidates: setupAgentCandidates({
          detections,
          selectedAgents,
          suggestedIds: suggestedIds.length > 0 ? suggestedIds : userDetectedIds,
          explicit: false,
          scope: args.options.scope,
        }),
      } satisfies SetupAgentSelection;
    }

    const selectedIds = Option.isSome(interaction)
      ? yield* interaction.value.selectAgents({
          allAgents: allAgentDescriptors(preferredIds),
          detectedIds,
          projectDetectedIds,
          userDetectedIds,
          suggestedIds,
          configuredIds,
        })
      : yield* SELECT_AGENTS_PROMPT_MISSING;
    const selectedAgents = selectedIds.flatMap((id) =>
      isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
    );
    return {
      selectedAgents,
      candidates: setupAgentCandidates({
        detections,
        selectedAgents,
        suggestedIds: suggestedIds.length > 0 ? suggestedIds : userDetectedIds,
        explicit: false,
        scope: args.options.scope,
      }),
    } satisfies SetupAgentSelection;
  });

/**
 * Effective setup scope support derived from the extension-type and coding-agent catalogs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
  type NativeCapability,
} from "../agent-capabilities/index.js";
import { userScopeRefusal } from "../agents/scope-refusal.js";
import {
  EXTENSION_TYPE_TABLE,
  extensionTypeLabels,
  extensionTypes,
  type ExtensionType,
  type ExtensionPlacement,
} from "../extensions/common.js";
import type { WorkspaceScope } from "./scope.js";

export type SetupScopeSupportStatus = "supported" | "project-only" | "unsupported" | "refused";

export type SetupScopeSupportReasonCode =
  | "supported"
  | "no-configured-agents"
  | "unknown-agent"
  | "native-capability-unavailable"
  | "axm-capability-unavailable"
  | "project-only"
  | "scope-not-modeled";

export interface SetupScopeSupportOutcome {
  readonly target: "workspace" | "container" | "agent" | "agent-set";
  readonly agentId?: string;
  readonly agentName?: string;
  readonly status: SetupScopeSupportStatus;
  readonly reasonCode: SetupScopeSupportReasonCode;
  readonly reason: string;
}

export interface SetupScopeSupportCategory {
  readonly type: ExtensionType;
  readonly label: string;
  readonly placement: ExtensionPlacement;
  readonly outcomes: ReadonlyArray<SetupScopeSupportOutcome>;
}

const isConfigurableAgentId = (id: string): id is ConfigurableAgentId =>
  Object.hasOwn(CONFIGURABLE_AGENTS_BY_ID, id);

const nativeSupportsScope = (native: NativeCapability, scope: WorkspaceScope): boolean =>
  native.availability.via !== "none" && "scopes" in native && native.scopes.includes(scope);

const capabilityReason = (axm: unknown, fallback: string): string =>
  typeof axm === "object" && axm !== null && "reason" in axm && typeof axm.reason === "string"
    ? axm.reason
    : fallback;

const supportedOutcome = (args: {
  readonly target: SetupScopeSupportOutcome["target"];
  readonly reason: string;
  readonly agentId?: string;
  readonly agentName?: string;
}): SetupScopeSupportOutcome => ({
  ...args,
  status: "supported",
  reasonCode: "supported",
});

const agentOutcome = (args: {
  readonly agentId: string;
  readonly agentName: string;
  readonly status: SetupScopeSupportStatus;
  readonly reasonCode: SetupScopeSupportReasonCode;
  readonly reason: string;
}): SetupScopeSupportOutcome => ({ target: "agent", ...args });

const noConfiguredAgentsOutcome = (): SetupScopeSupportOutcome => ({
  target: "agent-set",
  status: "unsupported",
  reasonCode: "no-configured-agents",
  reason: "No coding agents are configured for this scope.",
});

const unknownAgentOutcome = (agentId: string): SetupScopeSupportOutcome =>
  agentOutcome({
    agentId,
    agentName: agentId,
    status: "unsupported",
    reasonCode: "unknown-agent",
    reason: `${agentId} is not present in the coding-agent capability catalog.`,
  });

const capabilityUnavailableOutcome = (args: {
  readonly agentId: ConfigurableAgentId;
  readonly agentName: string;
  readonly typeLabel: string;
  readonly axmReason?: string;
}): SetupScopeSupportOutcome =>
  agentOutcome({
    agentId: args.agentId,
    agentName: args.agentName,
    status: "unsupported",
    reasonCode:
      args.axmReason === undefined ? "native-capability-unavailable" : "axm-capability-unavailable",
    reason:
      args.axmReason ??
      `${args.agentName} has no supported ${args.typeLabel.toLowerCase()} surface.`,
  });

const projectOnlyOutcome = (args: {
  readonly agentId: ConfigurableAgentId;
  readonly agentName: string;
  readonly typeLabel: string;
  readonly reason?: string;
}): SetupScopeSupportOutcome =>
  agentOutcome({
    agentId: args.agentId,
    agentName: args.agentName,
    status: "project-only",
    reasonCode: "project-only",
    reason:
      args.reason ??
      `${args.agentName} supports ${args.typeLabel.toLowerCase()} only in project scope.`,
  });

const scopeNotModeledOutcome = (args: {
  readonly agentId: ConfigurableAgentId;
  readonly agentName: string;
  readonly typeLabel: string;
  readonly reason?: string;
}): SetupScopeSupportOutcome =>
  agentOutcome({
    agentId: args.agentId,
    agentName: args.agentName,
    status: "refused",
    reasonCode: "scope-not-modeled",
    reason:
      args.reason ??
      `AXM has not modeled ${args.typeLabel.toLowerCase()} for ${args.agentName} in user scope.`,
  });

const perAgentOutcomes = (
  agentIds: ReadonlyArray<string>,
  resolve: (agentId: ConfigurableAgentId) => SetupScopeSupportOutcome,
): ReadonlyArray<SetupScopeSupportOutcome> => {
  if (agentIds.length === 0) return [noConfiguredAgentsOutcome()];
  return agentIds.map((agentId) =>
    isConfigurableAgentId(agentId) ? resolve(agentId) : unknownAgentOutcome(agentId),
  );
};

const skillOutcome = (
  agentId: ConfigurableAgentId,
  scope: WorkspaceScope,
): SetupScopeSupportOutcome => {
  const agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
  const capability = agent.capabilities.skill;
  const projectSupported =
    capability.axm.status === "supported" && nativeSupportsScope(capability.native, "project");
  if (capability.native.availability.via === "none") {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "Skills",
    });
  }
  if (capability.axm.status !== "supported") {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "Skills",
      axmReason: capabilityReason(capability.axm, `AXM does not support skills for ${agent.name}.`),
    });
  }
  if (nativeSupportsScope(capability.native, scope)) {
    return supportedOutcome({
      target: "agent",
      agentId,
      agentName: agent.name,
      reason: `${agent.name} supports skills in ${scope} scope.`,
    });
  }
  return projectSupported
    ? projectOnlyOutcome({ agentId, agentName: agent.name, typeLabel: "Skills" })
    : capabilityUnavailableOutcome({ agentId, agentName: agent.name, typeLabel: "Skills" });
};

const mcpOutcome = (
  agentId: ConfigurableAgentId,
  scope: WorkspaceScope,
): SetupScopeSupportOutcome => {
  const agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
  const capability = agent.capabilities["mcp-server"];
  if (capability.native.availability.via === "none") {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "MCP servers",
    });
  }
  if (capability.axm.status !== "supported" || capability.axm.writer === null) {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "MCP servers",
      axmReason: capabilityReason(
        capability.axm,
        `AXM has no supported MCP writer for ${agent.name}.`,
      ),
    });
  }
  const targets = capability.axm.writer.config.targets;
  const hasTarget = targets.some((target) => target.scope === scope);
  if (nativeSupportsScope(capability.native, scope) && hasTarget) {
    return supportedOutcome({
      target: "agent",
      agentId,
      agentName: agent.name,
      reason: `${agent.name} has an AXM-managed ${scope}-scope MCP target.`,
    });
  }
  const hasProjectTarget = targets.some((target) => target.scope === "project");
  if (scope === "user" && nativeSupportsScope(capability.native, "user") && hasProjectTarget) {
    return scopeNotModeledOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "MCP servers",
      reason: `AXM manages only project-scope MCP configuration for ${agent.name}; the native user-scope surface is not modeled.`,
    });
  }
  return scope === "user" && hasProjectTarget
    ? projectOnlyOutcome({ agentId, agentName: agent.name, typeLabel: "MCP servers" })
    : capabilityUnavailableOutcome({
        agentId,
        agentName: agent.name,
        typeLabel: "MCP servers",
      });
};

const subagentOutcome = (
  agentId: ConfigurableAgentId,
  scope: WorkspaceScope,
): SetupScopeSupportOutcome => {
  const agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
  const capability = agent.capabilities.subagent;
  const projectSupported =
    capability.native.availability.via !== "none" &&
    capability.axm.status === "supported" &&
    nativeSupportsScope(capability.native, "project");
  if (!projectSupported) {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "Subagents",
      ...(capability.axm.status === "supported"
        ? {}
        : {
            axmReason: capabilityReason(
              capability.axm,
              `AXM does not support subagents for ${agent.name}.`,
            ),
          }),
    });
  }
  if (scope === "project") {
    return supportedOutcome({
      target: "agent",
      agentId,
      agentName: agent.name,
      reason: `${agent.name} has an AXM-managed project-scope subagent target.`,
    });
  }
  const reason = userScopeRefusal({ agentId, agentName: agent.name, type: "subagents" });
  return nativeSupportsScope(capability.native, "user")
    ? scopeNotModeledOutcome({
        agentId,
        agentName: agent.name,
        typeLabel: "Subagents",
        reason,
      })
    : projectOnlyOutcome({
        agentId,
        agentName: agent.name,
        typeLabel: "Subagents",
        reason,
      });
};

const hookOutcome = (
  agentId: ConfigurableAgentId,
  scope: WorkspaceScope,
): SetupScopeSupportOutcome => {
  const agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
  const capability = agent.capabilities.hook;
  if (
    capability.native.availability.via === "none" ||
    capability.axm.status !== "supported" ||
    capability.axm.writer === null
  ) {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "Hooks",
      ...(capability.axm.status === "supported"
        ? {}
        : {
            axmReason: capabilityReason(
              capability.axm,
              `AXM does not support hooks for ${agent.name}.`,
            ),
          }),
    });
  }
  const hasProjectTarget = capability.axm.writer.configFiles.some(
    (target) => target.scope === "project",
  );
  if (!hasProjectTarget) {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "Hooks",
      axmReason: `AXM has no project-scope hook writer target for ${agent.name}.`,
    });
  }
  if (scope === "user") {
    return projectOnlyOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "Hooks",
      reason: `AXM hook materialization for ${agent.name} is intentionally project-only.`,
    });
  }
  return supportedOutcome({
    target: "agent",
    agentId,
    agentName: agent.name,
    reason: `${agent.name} has an AXM-managed project-scope hook target.`,
  });
};

const instructionOutcome = (
  agentId: ConfigurableAgentId,
  scope: WorkspaceScope,
): SetupScopeSupportOutcome => {
  const agent = CONFIGURABLE_AGENTS_BY_ID[agentId];
  const capability = agent.instructions;
  if (capability.native.availability.via === "none") {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "instruction files",
    });
  }
  if (capability.axm.status !== "supported") {
    return capabilityUnavailableOutcome({
      agentId,
      agentName: agent.name,
      typeLabel: "instruction files",
      axmReason: capabilityReason(
        capability.axm,
        `AXM does not support instruction projection for ${agent.name}.`,
      ),
    });
  }
  if (nativeSupportsScope(capability.native, scope)) {
    return supportedOutcome({
      target: "agent",
      agentId,
      agentName: agent.name,
      reason: `${agent.name} supports instruction files in ${scope} scope.`,
    });
  }
  return scope === "user" && nativeSupportsScope(capability.native, "project")
    ? projectOnlyOutcome({
        agentId,
        agentName: agent.name,
        typeLabel: "instruction files",
      })
    : capabilityUnavailableOutcome({
        agentId,
        agentName: agent.name,
        typeLabel: "instruction files",
      });
};

const categoryOutcomes = (
  type: ExtensionType,
  agentIds: ReadonlyArray<string>,
  scope: WorkspaceScope,
): ReadonlyArray<SetupScopeSupportOutcome> => {
  switch (type) {
    case "skill":
      return perAgentOutcomes(agentIds, (agentId) => skillOutcome(agentId, scope));
    case "mcp-server":
      return perAgentOutcomes(agentIds, (agentId) => mcpOutcome(agentId, scope));
    case "subagent":
      return perAgentOutcomes(agentIds, (agentId) => subagentOutcome(agentId, scope));
    case "hook":
      return perAgentOutcomes(agentIds, (agentId) => hookOutcome(agentId, scope));
    case "rule":
      return [
        supportedOutcome({
          target: "workspace",
          reason: `Rule packages and the canonical instruction source are supported in ${scope} scope.`,
        }),
        ...perAgentOutcomes(agentIds, (agentId) => instructionOutcome(agentId, scope)),
      ];
    case "knowledge":
      return [
        supportedOutcome({
          target: "workspace",
          reason: `Knowledge bundles are supported in ${scope} scope.`,
        }),
      ];
    case "pack":
      return [
        supportedOutcome({
          target: "container",
          reason: `Pack intent is supported in ${scope} scope; member outcomes follow their categories.`,
        }),
      ];
  }
};

/** Derive setup's category and per-agent scope contract from canonical catalogs. */
export const setupScopeSupport = (
  agentIds: ReadonlyArray<string>,
  scope: WorkspaceScope,
): ReadonlyArray<SetupScopeSupportCategory> =>
  extensionTypes.map((type) => ({
    type,
    label: extensionTypeLabels[type],
    placement: EXTENSION_TYPE_TABLE[type].placement,
    outcomes: categoryOutcomes(type, agentIds, scope),
  }));

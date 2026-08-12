import type { AgentId } from "../../agents/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/index.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import type { JobStepArtifact, JobStepArtifactTarget } from "../../plan/plan.js";

export const MCP_CONFIG_SURFACE = ".axm (config/lockfile)";
export const MCP_AGENT_CONFIG_SURFACE = ".mcp.json";

export const mcpServerVersion = (entry: McpServerLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

export const mcpServerSourcePath = (entry: McpServerLockEntry): string =>
  entry.type === "registry"
    ? `${REGISTRY_EXTENSIONS_DIR}/${entry.owner}/mcps/${entry.name}`
    : MCP_CONFIG_SURFACE;

export const agentConfigTarget = (
  change: JobStepArtifactTarget["change"],
  agentIds: ReadonlyArray<AgentId>,
): JobStepArtifactTarget | undefined =>
  agentIds.length === 0
    ? undefined
    : {
        path: MCP_AGENT_CONFIG_SURFACE,
        change,
        agentIds,
      };

export interface AgentMcpConfigOutcome {
  readonly agentId: string;
  readonly targets?: ReadonlyArray<JobStepArtifactTarget>;
}

const mergeTargetChange = (
  current: JobStepArtifactTarget["change"],
  next: JobStepArtifactTarget["change"],
): JobStepArtifactTarget["change"] => {
  if (current === "created" || next === "created") return "created";
  if (current === "updated" || next === "updated") return "updated";
  if (current === "removed" || next === "removed") return "removed";
  return "unchanged";
};

export const agentConfigTargets = (
  outcomes: ReadonlyArray<AgentMcpConfigOutcome>,
): ReadonlyArray<JobStepArtifactTarget> => {
  const grouped = new Map<
    string,
    {
      readonly path: string;
      change: JobStepArtifactTarget["change"];
      agentIds: Array<string>;
    }
  >();

  for (const outcome of outcomes) {
    for (const target of outcome.targets ?? []) {
      const existing = grouped.get(target.path);
      if (existing === undefined) {
        grouped.set(target.path, {
          path: target.path,
          change: target.change,
          agentIds: [outcome.agentId],
        });
        continue;
      }
      existing.change = mergeTargetChange(existing.change, target.change);
      existing.agentIds.push(outcome.agentId);
    }
  }

  return Array.from(grouped.values()).map((target) => ({
    path: target.path,
    change: target.change,
    agentIds: target.agentIds,
  }));
};

export const mcpSettingsTarget = (
  change: JobStepArtifactTarget["change"],
): JobStepArtifactTarget => ({
  path: MCP_CONFIG_SURFACE,
  change,
});

export const mcpSourceTarget = (
  entry: McpServerLockEntry,
  change: JobStepArtifactTarget["change"],
): JobStepArtifactTarget => ({
  path: mcpServerSourcePath(entry),
  change,
});

export const mcpServerArtifact = (args: {
  readonly lockEntry: McpServerLockEntry | undefined;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
  readonly agents?: ReadonlyArray<string>;
}): JobStepArtifact => {
  const version = args.lockEntry === undefined ? undefined : mcpServerVersion(args.lockEntry);

  return {
    path: args.lockEntry === undefined ? MCP_CONFIG_SURFACE : mcpServerSourcePath(args.lockEntry),
    scope: args.scope,
    change: args.change,
    ...(args.agents === undefined ? {} : { agents: args.agents }),
    ...(version === undefined ? {} : { version }),
    ...(args.targets.length === 0
      ? {}
      : {
          fileCount: args.targets.length,
          targets: args.targets,
        }),
  };
};

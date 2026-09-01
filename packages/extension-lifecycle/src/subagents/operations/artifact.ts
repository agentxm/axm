import type { JobStepArtifact, JobStepArtifactTarget } from "@agentxm/workspace-operations";

export const SUBAGENT_CONFIG_SURFACE = ".axm (config/lockfile)";

export const subagentConfigTarget = (
  change: JobStepArtifactTarget["change"],
): JobStepArtifactTarget => ({
  path: SUBAGENT_CONFIG_SURFACE,
  change,
});

export const renderedSubagentTargets = (
  renderedFiles: Readonly<Record<string, ReadonlyArray<{ readonly path: string }>>>,
  change: JobStepArtifactTarget["change"],
): ReadonlyArray<JobStepArtifactTarget> => {
  const byPath = new Map<string, Array<string>>();
  for (const [agentId, files] of Object.entries(renderedFiles)) {
    for (const file of files) {
      const existing = byPath.get(file.path);
      if (existing === undefined) {
        byPath.set(file.path, [agentId]);
        continue;
      }
      if (!existing.includes(agentId)) {
        existing.push(agentId);
      }
    }
  }

  return [...byPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, agentIds]) => ({
      path,
      change,
      ...(agentIds.length > 0 ? { agentIds } : {}),
    }));
};

export const subagentLifecycleArtifact = (args: {
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
  readonly agents?: ReadonlyArray<string>;
  readonly version?: string;
  readonly change: JobStepArtifact["change"];
  readonly renderedFiles?: Readonly<Record<string, ReadonlyArray<{ readonly path: string }>>>;
  readonly renderedChange?: JobStepArtifactTarget["change"];
}): JobStepArtifact => {
  const renderedTargets =
    args.renderedFiles === undefined
      ? []
      : renderedSubagentTargets(args.renderedFiles, args.renderedChange ?? args.change);
  const targets = [subagentConfigTarget("updated"), ...renderedTargets];

  return {
    path: renderedTargets[0]?.path ?? SUBAGENT_CONFIG_SURFACE,
    scope: args.scope,
    ...(args.agents === undefined || args.agents.length === 0 ? {} : { agents: args.agents }),
    ...(args.version === undefined ? {} : { version: args.version }),
    change: args.change,
    fileCount: targets.length,
    targets,
  };
};

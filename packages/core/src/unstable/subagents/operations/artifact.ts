import { canonicalExtensionRelativePath } from "../../extensions/index.js";
import type { Handle } from "../../extensions/index.js";
import type { JobStepArtifact, JobStepArtifactTarget } from "../../plan/plan.js";
import { MANIFEST_FILENAME } from "../manifest-schema.js";
import { subagentContentFilename } from "../paths.js";

export const SUBAGENT_CONFIG_SURFACE = ".axm (config/lockfile)";

export const subagentSourcePath = (owner: Handle, name: string): string =>
  canonicalExtensionRelativePath("subagents", { type: "registry", owner, name });

export const subagentManifestSourcePath = (owner: Handle, name: string): string =>
  `${subagentSourcePath(owner, name)}/${MANIFEST_FILENAME}`;

export const subagentContentSourcePath = (owner: Handle, name: string): string =>
  `${subagentSourcePath(owner, name)}/src/${subagentContentFilename(name)}`;

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

export const subagentScaffoldArtifact = (args: {
  readonly owner: Handle;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
  readonly version: string;
}): JobStepArtifact => {
  const targets: ReadonlyArray<JobStepArtifactTarget> = [
    { path: subagentManifestSourcePath(args.owner, args.name), change: "created" },
    { path: subagentContentSourcePath(args.owner, args.name), change: "created" },
  ];

  return {
    path: subagentSourcePath(args.owner, args.name),
    scope: args.scope,
    version: args.version,
    change: "created",
    fileCount: targets.length,
    targets,
  };
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

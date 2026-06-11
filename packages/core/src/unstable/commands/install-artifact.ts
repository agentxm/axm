import * as Option from "effect/Option";
import type { Path } from "effect/Path";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import type { CommandLockEntry } from "../lockfile/index.js";
import type { JobStepArtifact, JobStepArtifactTarget } from "../plan/plan.js";

const commandVersion = (
  entry: CommandLockEntry,
  versionRange: Option.Option<string>,
): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : Option.getOrUndefined(versionRange);

const renderedFileTargets = (
  renderedFiles: CommandLockEntry["renderedFiles"],
  change: JobStepArtifact["change"],
): ReadonlyArray<JobStepArtifactTarget> => {
  if (renderedFiles === undefined) return [];

  const agentIdsByPath = new Map<string, Array<string>>();
  for (const [agentId, files] of Object.entries(renderedFiles)) {
    for (const file of files) {
      const agentIds = agentIdsByPath.get(file.path) ?? [];
      if (!agentIds.includes(agentId)) {
        agentIds.push(agentId);
      }
      agentIdsByPath.set(file.path, agentIds);
    }
  }

  return Array.from(agentIdsByPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([targetPath, agentIds]): JobStepArtifactTarget => ({
        path: targetPath,
        change,
        agentIds: [...agentIds].sort(),
      }),
    );
};

const renderedFilesEqual = (
  left: CommandLockEntry["renderedFiles"],
  right: CommandLockEntry["renderedFiles"],
): boolean => {
  const leftTargets = renderedFileTargets(left, "unchanged").map((target) => ({
    path: target.path,
    agentIds: target.agentIds ?? [],
  }));
  const rightTargets = renderedFileTargets(right, "unchanged").map((target) => ({
    path: target.path,
    agentIds: target.agentIds ?? [],
  }));
  return JSON.stringify(leftTargets) === JSON.stringify(rightTargets);
};

const sourceHashOf = (entry: CommandLockEntry): string | undefined =>
  "sourceHash" in entry ? entry.sourceHash : undefined;

const commandArtifactChange = (
  previous: Option.Option<CommandLockEntry>,
  current: CommandLockEntry,
): JobStepArtifact["change"] => {
  if (Option.isNone(previous)) return "created";
  const previousEntry = previous.value;
  const sameSource = sourceHashOf(previousEntry) === sourceHashOf(current);
  const sameTargets = renderedFilesEqual(previousEntry.renderedFiles, current.renderedFiles);
  return sameSource && sameTargets ? "unchanged" : "updated";
};

export const commandInstallArtifact = (args: {
  readonly lockEntry: CommandLockEntry;
  readonly previousLockEntry: Option.Option<CommandLockEntry>;
  readonly versionRange: Option.Option<string>;
  readonly canonicalPath?: string;
  readonly fallbackPath: string;
  readonly scope: JobStepArtifact["scope"];
  readonly workspaceRoot: string;
  readonly pathService: Path;
}): JobStepArtifact => {
  const change = commandArtifactChange(args.previousLockEntry, args.lockEntry);
  const targets = renderedFileTargets(args.lockEntry.renderedFiles, change);
  const firstTarget = targets[0];
  const version = commandVersion(args.lockEntry, args.versionRange);
  const canonicalRelativePath =
    args.canonicalPath === undefined
      ? args.fallbackPath
      : args.pathService.relative(args.workspaceRoot, args.canonicalPath);

  return {
    path: firstTarget?.path ?? canonicalRelativePath,
    scope: args.scope,
    ...(args.lockEntry.agents.length === 0 ? {} : { agents: args.lockEntry.agents }),
    ...(version === undefined ? {} : { version }),
    change,
    ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
  };
};

export const commandUninstallArtifact = (args: {
  readonly commandName: string;
  readonly lockEntry: Option.Option<CommandLockEntry>;
  readonly scope: JobStepArtifact["scope"];
  readonly change: "removed" | "unchanged";
}): JobStepArtifact => {
  if (Option.isNone(args.lockEntry)) {
    return {
      path: args.commandName,
      scope: args.scope,
      change: args.change,
    };
  }

  const lockEntry = args.lockEntry.value;
  const sourcePath =
    lockEntry.type === "registry"
      ? `${REGISTRY_EXTENSIONS_DIR}/${lockEntry.owner}/commands/${lockEntry.name}`
      : `${EXTERNAL_EXTENSIONS_DIR}/commands/${args.commandName}`;
  const renderedTargets = renderedFileTargets(lockEntry.renderedFiles, args.change);
  const targets: ReadonlyArray<JobStepArtifactTarget> = [
    { path: ".axm/axm-lock.yaml", change: "updated" },
    { path: ".axm/settings.json", change: "updated" },
    { path: sourcePath, change: args.change },
    ...renderedTargets,
  ];
  const firstTarget = targets[0];
  const version = commandVersion(lockEntry, Option.none());

  return {
    path: firstTarget?.path ?? args.commandName,
    scope: args.scope,
    ...(lockEntry.agents.length === 0 ? {} : { agents: lockEntry.agents }),
    ...(version === undefined ? {} : { version }),
    change: args.change,
    ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
  };
};

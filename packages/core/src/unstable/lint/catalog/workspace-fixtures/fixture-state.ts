import type { AgentId } from "../../../agents/types.js";
import { AGENTS } from "../../../agents/registry.js";
import type {
  FileSpec,
  FixtureSpec,
  ScopeFiles,
} from "../../../workspace/read-model/__fixtures__/builder.js";
import type { WorkspaceState } from "./interpret-ops.js";

const pathSegments = (relativePath: string): ReadonlyArray<string> =>
  relativePath.split("/").filter((segment) => segment.length > 0);

const firstPathSegment = (relativePath: string): string | undefined =>
  pathSegments(relativePath)[0];

const agentRootForSkillsDir = (skillsDir: string): string | undefined =>
  firstPathSegment(skillsDir);

const relativeUnderAgentRoot = (agentRoot: string, relativePath: string): string | undefined => {
  if (relativePath === agentRoot) return "";
  const prefix = `${agentRoot}/`;
  if (!relativePath.startsWith(prefix)) return undefined;
  return relativePath.slice(prefix.length);
};

const skillNameFromPath = (skillsDir: string, relativePath: string): string | undefined => {
  const prefix = `${skillsDir}/`;
  if (!relativePath.startsWith(prefix)) return undefined;
  const afterSkillsDir = relativePath.slice(prefix.length);
  return firstPathSegment(afterSkillsDir);
};

const literalFileFor = (relativePath: string): string => {
  const segments = pathSegments(relativePath);
  const name = segments.at(-2) ?? segments.at(-1) ?? "fixture";
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".md")) return `# ${name}\n`;
  if (lower.endsWith(".json")) return "{}\n";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "{}\n";
  return "";
};

const addTreeFile = (
  tree: Record<string, string | FileSpec>,
  relativePath: string,
  contents = literalFileFor(relativePath),
): void => {
  tree[relativePath] = contents;
};

const addAgentSkillArtifact = (
  agentDirs: Record<string, Record<string, string | FileSpec>>,
  agentId: AgentId,
  relativePath: string,
): void => {
  const agent = AGENTS[agentId];
  const agentRoot = agentRootForSkillsDir(agent.skills.dir);
  if (agentRoot === undefined) return;
  const relative = relativeUnderAgentRoot(agentRoot, relativePath);
  if (relative === undefined) return;
  const skillName = skillNameFromPath(agent.skills.dir, relativePath);
  const materializedPath =
    skillName === undefined
      ? relative
      : `${agent.skills.dir.slice(agentRoot.length + 1)}/${skillName}/SKILL.md`;
  if (materializedPath.length === 0) return;
  const tree = agentDirs[agentId] ?? {};
  agentDirs[agentId] = tree;
  addTreeFile(tree, materializedPath);
};

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

const fileSpecFor = (raw: unknown): FileSpec | undefined => {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Fixture state expected an object for settings/lockfile; got ${typeof raw}`);
  }
  return { _tag: "valid", contents: raw };
};

export const scopeFilesFromWorkspaceState = (state: WorkspaceState): ScopeFiles => {
  const axmExtensions: Record<string, string | FileSpec> = {};
  const agentDirs: Record<string, Record<string, string | FileSpec>> = {};
  const agentSettings: Record<string, FileSpec> = {};
  const agents = Object.values(AGENTS);

  const addExistingPath = (relativePath: string): void => {
    const acquiredPrefix = "agent_extensions/";
    if (relativePath.startsWith(acquiredPrefix)) {
      addTreeFile(axmExtensions, relativePath.slice(acquiredPrefix.length));
      return;
    }
    const axmPrefix = "agent_extensions/";
    if (relativePath.startsWith(axmPrefix)) {
      addTreeFile(axmExtensions, relativePath.slice(axmPrefix.length));
      return;
    }

    for (const agent of agents) {
      if (skillNameFromPath(agent.skills.dir, relativePath) !== undefined) {
        addAgentSkillArtifact(agentDirs, agent.id, relativePath);
      }
    }
  };

  for (const relativePath of state.existingPaths) {
    addExistingPath(relativePath);
  }

  for (const [dir, entries] of state.listings) {
    for (const entry of entries) {
      addExistingPath(`${dir}/${entry}`);
    }
  }

  for (const agentId of state.detectedProjectAgents) {
    if (isKnownAgentId(agentId)) {
      agentSettings[agentId] = { _tag: "valid", contents: {} };
    }
  }

  const settings = fileSpecFor(state.settings);
  const lockfile = fileSpecFor(state.lockfile);

  return {
    ...(settings === undefined ? {} : { settings }),
    ...(lockfile === undefined ? {} : { lockfile }),
    ...(Object.keys(axmExtensions).length === 0 ? {} : { axmExtensions }),
    ...(Object.keys(agentDirs).length === 0 ? {} : { agentDirs }),
    ...(Object.keys(agentSettings).length === 0 ? {} : { agentSettings }),
  };
};

export const fixtureSpecFromWorkspaceState = (
  state: WorkspaceState,
  scope: "project" | "user",
  roots: { readonly workspaceRoot: string; readonly userHome: string },
): FixtureSpec => {
  const scopeFiles = scopeFilesFromWorkspaceState(state);
  return {
    workspaceRoot: roots.workspaceRoot,
    userHome: roots.userHome,
    ...(scope === "project" ? { project: scopeFiles } : {}),
    ...(scope === "user" ? { user: scopeFiles } : {}),
  };
};

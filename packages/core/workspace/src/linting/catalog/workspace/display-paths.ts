import type { WorkspaceRuleContext } from "../../workspace-context.js";

type WorkspaceScope = WorkspaceRuleContext["subject"]["scope"];

export const settingsDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

export const lockfileDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm-lock.yaml" : ".axm/workspace/axm-lock.yaml";

/** A path under the workspace root, relative to it; any other path unchanged. */
export const workspaceDisplayPath = (root: string, file: string): string => {
  const prefix = `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
};

export const canonicalDisplayRoot = (scope: WorkspaceScope): string =>
  scope === "project" ? "agent_extensions" : ".axm/workspace/agent_extensions";

import type { WorkspaceRuleContext } from "../../context.js";

type WorkspaceScope = WorkspaceRuleContext["subject"]["scope"];

export const settingsDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/workspace/axm.json";

export const lockfileDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm-lock.yaml" : ".axm/workspace/axm-lock.yaml";

export const canonicalDisplayRoot = (scope: WorkspaceScope): string =>
  scope === "project" ? "agent_extensions" : ".axm/workspace/agent_extensions";

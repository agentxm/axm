import type { WorkspaceRuleContext } from "../../context.js";

type WorkspaceScope = WorkspaceRuleContext["subject"]["scope"];

export const settingsDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm.json" : ".axm/settings.json";

export const lockfileDisplayPath = (scope: WorkspaceScope): string =>
  scope === "project" ? "axm-lock.yaml" : ".axm/axm-lock.yaml";

export const canonicalDisplayRoot = (scope: WorkspaceScope): string =>
  scope === "project" ? "agent_extensions" : ".axm/extensions";

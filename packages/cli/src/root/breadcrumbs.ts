import type { Breadcrumb } from "@agentxm/client-core/unstable/cli-runtime";

export const LIST_INSTALLED_SKILLS = {
  description: "List installed skills",
  cmd: "axm skills list",
} as const satisfies Breadcrumb;

export const INSTALL_SKILL_FROM_REGISTRY = {
  description: "Install with an explicit source like github:owner/repo or @owner/skills/name",
  cmd: "axm skills install <source>",
} as const satisfies Breadcrumb;

export const SCAFFOLD_MANAGED_SKILL = {
  description: "Scaffold a managed skill",
  cmd: "axm skills new",
} as const satisfies Breadcrumb;

export const ADD_REGISTRY_SOURCE = {
  description: "Add a registry source",
  cmd: "axm sources add",
} as const satisfies Breadcrumb;

export const SKILL_NAME_RULES = "Use lowercase letters, numbers, and hyphens; up to 64 characters";

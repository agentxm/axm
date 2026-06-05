import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";

export const SET_UP_AXM_WORKSPACE = {
  description: "Set up AXM in this workspace",
  cmd: "axm setup",
} as const satisfies SuggestedAction;

export const LIST_INSTALLED_SKILLS = {
  description: "List installed skills",
  cmd: "axm skills list",
} as const satisfies SuggestedAction;

export const INSTALL_EXTENSION_FROM_REGISTRY = {
  description: "Install an extension from a registry FQN or source locator",
  cmd: "axm install <source>",
} as const satisfies SuggestedAction;

export const INSTALL_SKILL_FROM_REGISTRY = {
  description: "Install with an explicit source like github:owner/repo or @owner/skills/name",
  cmd: "axm skills install <source>",
} as const satisfies SuggestedAction;

export const INSTALL_COMMAND_FROM_REGISTRY = {
  description: "Install a command from a registry like @owner/commands/name",
  cmd: "axm commands install <source>",
} as const satisfies SuggestedAction;

export const INSTALL_FILES_FROM_REGISTRY = {
  description: "Install a files package from a registry like @owner/files/name",
  cmd: "axm files install <source>",
} as const satisfies SuggestedAction;

export const INSTALL_HOOK_FROM_REGISTRY = {
  description: "Install a hook from a registry like @owner/hooks/name",
  cmd: "axm hooks install <source>",
} as const satisfies SuggestedAction;

export const INSTALL_MCP_FROM_REGISTRY = {
  description: "Install an MCP server from a registry like @owner/mcps/name",
  cmd: "axm mcps install <source>",
} as const satisfies SuggestedAction;

export const ADD_INLINE_MCP_SERVER = {
  description: "Add an inline MCP server",
  cmd: "axm mcps add <name> --url <url>",
} as const satisfies SuggestedAction;

export const INSTALL_PACK_FROM_REGISTRY = {
  description: "Install a pack from a registry like @owner/packs/name",
  cmd: "axm packs install <source>",
} as const satisfies SuggestedAction;

export const INSTALL_SUBAGENT_FROM_REGISTRY = {
  description: "Install a subagent from a registry like @owner/subagents/name",
  cmd: "axm subagents install <source>",
} as const satisfies SuggestedAction;

export const SCAFFOLD_MANAGED_SKILL = {
  description: "Scaffold a managed skill",
  cmd: "axm skills new",
} as const satisfies SuggestedAction;

export const ADD_REGISTRY_SOURCE = {
  description: "Add a registry source",
  cmd: "axm sources add",
} as const satisfies SuggestedAction;

export const SKILL_NAME_RULES = "Use lowercase letters, numbers, and hyphens; up to 64 characters";

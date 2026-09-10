/**
 * Agent-agnostic extension type capability catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionTypeCatalog, ExtensionTypeDefinition } from "./schema.js";
import { STANDARDS } from "./standards.js";

const skill = {
  id: "skill",
  summary: "Package reusable agent skills with SKILL.md metadata and instructions.",
  description:
    "Reusable capability packages authored in the Agent Skills format. Read by the agent as task-specific behavior and grounded by the Agent Skills open standard.",
  standard: STANDARDS.skills,
  docs: [{ label: "Skill manifest schema", url: "https://axm.sh/schemas/skill.schema.json" }],
} satisfies ExtensionTypeDefinition;

const mcpServer = {
  id: "mcp-server",
  summary: "Configure Model Context Protocol servers for agents.",
  description:
    "MCP server connections installed into each agent's native MCP configuration. The Model Context Protocol is the authoritative standard for this capability.",
  standard: STANDARDS.mcp,
  docs: [{ label: "MCP server manifest schema", url: "https://axm.sh/schemas/mcp.schema.json" }],
} satisfies ExtensionTypeDefinition;

const subagent = {
  id: "subagent",
  summary: "Install specialized agent profiles into an agent's native subagent system.",
  description:
    "Delegated agent profiles installed into vendor-specific subagent layouts. Subagents have no governing open standard.",
  standard: null,
  docs: [{ label: "Subagent manifest schema", url: "https://axm.sh/schemas/subagent.schema.json" }],
} satisfies ExtensionTypeDefinition;

const rule = {
  id: "rule",
  summary: "Sync instruction files and distribute rule extensions that inject into them.",
  description:
    "Umbrella capability for behavior-governing instructions: syncing AGENTS.md, CLAUDE.md, and rules directories, and distributing rule extensions that inject content into those instruction files. Read by the agent to shape behavior.",
  standard: STANDARDS.rules,
  docs: [{ label: "Rule manifest schema", url: "https://axm.sh/schemas/rule.schema.json" }],
} satisfies ExtensionTypeDefinition;

const hook = {
  id: "hook",
  summary: "Install lifecycle hook extensions into an agent's native hook system.",
  description:
    "Lifecycle automation hooks installed into vendor-specific agent hook systems. Hooks have no governing open standard.",
  standard: null,
  docs: [{ label: "Hook manifest schema", url: "https://axm.sh/schemas/hook.schema.json" }],
} satisfies ExtensionTypeDefinition;

const knowledge = {
  id: "knowledge",
  summary: "Package portable Open Knowledge Format concept bundles.",
  description:
    "Reference knowledge installed as isolated Markdown concept bundles using Open Knowledge Format 0.2. Knowledge is discoverable and readable without being injected into agent instructions.",
  standard: STANDARDS.okf,
  docs: [
    { label: "Knowledge manifest schema", url: "https://axm.sh/schemas/knowledge.schema.json" },
  ],
} satisfies ExtensionTypeDefinition;

/** @experimental This API is unstable and may change without notice. */
export const EXTENSION_TYPES_BY_ID = {
  skill,
  "mcp-server": mcpServer,
  subagent,
  rule,
  hook,
  knowledge,
} satisfies ExtensionTypeCatalog;

/** @experimental This API is unstable and may change without notice. */
export const EXTENSION_TYPES = Object.values(EXTENSION_TYPES_BY_ID);

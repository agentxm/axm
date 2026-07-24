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
  docs: [{ label: "Agent Skills", url: "https://agentskills.io" }],
} satisfies ExtensionTypeDefinition;

const command = {
  id: "command",
  summary: "Install slash commands or prompt commands in an agent's native command location.",
  description:
    "User-invoked command prompts installed into an agent's native command system. Commands have no governing open standard.",
  standard: null,
  docs: [],
} satisfies ExtensionTypeDefinition;

const mcpServer = {
  id: "mcp-server",
  summary: "Configure Model Context Protocol servers for agents.",
  description:
    "MCP server connections installed into each agent's native MCP configuration. The Model Context Protocol is the authoritative standard for this capability.",
  standard: STANDARDS.mcp,
  docs: [{ label: "Model Context Protocol", url: "https://modelcontextprotocol.io" }],
} satisfies ExtensionTypeDefinition;

const subagent = {
  id: "subagent",
  summary: "Install specialized agent profiles into an agent's native subagent system.",
  description:
    "Delegated agent profiles installed into vendor-specific subagent layouts. Subagents have no governing open standard.",
  standard: null,
  docs: [],
} satisfies ExtensionTypeDefinition;

const files = {
  id: "files",
  summary: "Scaffold and manage standalone .md context files.",
  description:
    "Context material the agent may reference, such as scaffolded docs or notes. These files are not behavior-governing instructions; behavior-governing instructions are rule. Context files have no governing standard.",
  standard: null,
  docs: [],
} satisfies ExtensionTypeDefinition;

const rule = {
  id: "rule",
  summary: "Sync instruction files and distribute rule extensions that inject into them.",
  description:
    "Umbrella capability for behavior-governing instructions: syncing AGENTS.md, CLAUDE.md, and rules directories, and distributing rule extensions that inject content into those instruction files. Read by the agent to shape behavior.",
  standard: STANDARDS.rules,
  docs: [{ label: "AGENTS.md", url: "https://agents.md" }],
} satisfies ExtensionTypeDefinition;

const hook = {
  id: "hook",
  summary: "Install lifecycle hook extensions into an agent's native hook system.",
  description:
    "Lifecycle automation hooks installed into vendor-specific agent hook systems. Hooks have no governing open standard.",
  standard: null,
  docs: [],
} satisfies ExtensionTypeDefinition;

const knowledge = {
  id: "knowledge",
  summary: "Package portable Open Knowledge Format concept bundles.",
  description:
    "Reference knowledge installed as isolated Markdown concept bundles using the Open Knowledge Format. New bundles target OKF 0.2; published 0.1 bundles remain valid. Knowledge is discoverable and readable without being injected into agent instructions.",
  standard: {
    id: "okf-0.2",
    name: "Open Knowledge Format 0.2",
    url: "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md",
  },
  docs: [
    {
      label: "Open Knowledge Format",
      url: "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md",
    },
  ],
} satisfies ExtensionTypeDefinition;

/** @experimental This API is unstable and may change without notice. */
export const EXTENSION_TYPES_BY_ID = {
  skill,
  command,
  "mcp-server": mcpServer,
  subagent,
  files,
  rule,
  hook,
  knowledge,
} satisfies ExtensionTypeCatalog;

/** @experimental This API is unstable and may change without notice. */
export const EXTENSION_TYPES = Object.values(EXTENSION_TYPES_BY_ID);

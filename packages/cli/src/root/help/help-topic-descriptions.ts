import type { HelpTopicName } from "../../__generated__/help-topics.js";

/**
 * One-line description per help topic, shown in the `axm help` index table.
 *
 * Hand-curated — keep entries short and index-friendly. The `satisfies` clause
 * makes `tsc` fail when a topic file is added without a description here, or
 * when a description outlives the topic it described.
 */
export const HELP_TOPIC_DESCRIPTIONS = {
  "getting-started": "Set up AXM in a new workspace and install your first extension.",
  "basic-usage": "Everyday commands for installing, updating, and removing extensions.",
  "machine-output": "JSON stdout documents, NDJSON stderr events, envelopes, and field nesting.",
  "git-hooks": "Run AXM against the exact Git index from common hook managers and CI.",
  authoring: "How to write registry-facing extension descriptions, keywords, and READMEs.",
  skills: "How skill extensions work and how AXM installs and manages them.",
  "skill-schema": "JSON Schema for a skill extension manifest.",
  subagents: "How subagent extensions work and how AXM installs and manages them.",
  "subagent-schema": "JSON Schema for a subagent extension manifest.",
  packs: "How packs bundle multiple extensions for one-step install.",
  "pack-schema": "JSON Schema for a pack manifest.",
  "package-extensions": "How AXM links registry extensions to ecosystem packages.",
  rules: "How Rule extensions contribute managed guidance to workspace instructions.",
  instructions: "How AXM propagates one canonical instruction file to configured agents.",
  "rule-schema": "JSON Schema for a rule extension manifest.",
  hooks: "How hook extensions run on agent lifecycle events and how AXM installs and manages them.",
  knowledge: "How AXM validates, projects, and synchronizes Knowledge bundles.",
  "hook-schema": "JSON Schema for a hook extension manifest.",
  "knowledge-schema": "JSON Schema for an Open Knowledge Format bundle manifest.",
  settings: "What AXM tracks in the .axm/settings.json workspace state file.",
  "workspace-state": "How desired, accepted-resolution, and observed state drive reconciliation.",
  "settings-schema": "JSON Schema for the .axm/settings.json file.",
  mcps: "How MCP server extensions work and how AXM installs and manages them.",
  "mcp-schema": "JSON Schema for an MCP server manifest.",
  "axm-lock-schema": "JSON Schema for the AXM lockfile.",
  "axm-package-meta-schema": "JSON Schema for package-native AXM extension metadata.",
  "exit-codes": "Exit codes returned by AXM commands and what each one means.",
  upgrade: "How AXM selects, verifies, delegates, and rolls back CLI upgrades.",
} as const satisfies Record<HelpTopicName, string>;

/**
 * Type definitions for AI coding agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Record } from "effect";

// -----------------------------------------------------------------------------
// Agent Skills Configuration
// -----------------------------------------------------------------------------

/**
 * Skills-specific configuration for an agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentSkillsDescriptor {
  /** Skills directory, relative to cwd (e.g., ".claude/skills") */
  readonly dir: string;
}

// -----------------------------------------------------------------------------
// Agent Identifiers
// -----------------------------------------------------------------------------

/**
 * Known agent identifiers - exhaustive list from vercel-labs/skills reference.
 *
 * Single source of truth: `AGENT_IDS` tuple drives both the `AgentId` type
 * and `AgentIdSchema` (in extensions/common.ts) — adding an agent here
 * automatically updates both.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AGENT_IDS = [
  "adal",
  "amp",
  "antigravity",
  "augment",
  "claude-code",
  "cline",
  "codebuddy",
  "codex",
  "command-code",
  "continue",
  "crush",
  "cursor",
  "droid",
  "gemini-cli",
  "github-copilot",
  "goose",
  "iflow-cli",
  "junie",
  "kilo",
  "kimi-cli",
  "kiro-cli",
  "kode",
  "mcpjam",
  "mistral-vibe",
  "mux",
  "neovate",
  "openclaw",
  "opencode",
  "openhands",
  "pi",
  "pochi",
  "qoder",
  "qwen-code",
  "replit",
  "roo",
  "trae",
  "trae-cn",
  "windsurf",
  "zencoder",
] as const;

/** @experimental This API is unstable and may change without notice. */
export type AgentId = (typeof AGENT_IDS)[number];

// -----------------------------------------------------------------------------
// Agent Configuration
// -----------------------------------------------------------------------------

/**
 * Configuration for an AI coding agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentDescriptor {
  /** Unique identifier (e.g., "claude-code") */
  readonly id: AgentId;
  /** Human-readable display name (e.g., "Claude Code") */
  readonly name: string;
  /** Skills installation configuration */
  readonly skills: AgentSkillsDescriptor;
}

// -----------------------------------------------------------------------------
// Agent Registry
// -----------------------------------------------------------------------------

/**
 * Registry of all known agents, keyed by agent ID for O(1) lookup.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentRegistry = Record.ReadonlyRecord<AgentId, AgentDescriptor>;

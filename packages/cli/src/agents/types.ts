/**
 * Type definitions for AI coding agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as PlatformError from "@effect/platform/Error";
import type * as FileSystem from "@effect/platform/FileSystem";
import type { Effect, Option, Record } from "effect";

// -----------------------------------------------------------------------------
// Agent Skills Configuration
// -----------------------------------------------------------------------------

/**
 * Skills-specific configuration for an agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentSkillsConfig {
  /** Project-level skills directory, relative to cwd (e.g., ".claude/skills") */
  readonly projectDir: string;
  /** Global skills directory, absolute path. None if agent doesn't support global installation. */
  readonly globalDir: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Agent Identifiers
// -----------------------------------------------------------------------------

/**
 * Known agent identifiers - exhaustive list from vercel-labs/skills reference.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentId =
  | "adal"
  | "amp"
  | "antigravity"
  | "augment"
  | "claude-code"
  | "cline"
  | "codebuddy"
  | "codex"
  | "command-code"
  | "continue"
  | "crush"
  | "cursor"
  | "droid"
  | "gemini-cli"
  | "github-copilot"
  | "goose"
  | "iflow-cli"
  | "junie"
  | "kilo"
  | "kimi-cli"
  | "kiro-cli"
  | "kode"
  | "mcpjam"
  | "mistral-vibe"
  | "mux"
  | "neovate"
  | "openclaw"
  | "opencode"
  | "openhands"
  | "pi"
  | "pochi"
  | "qoder"
  | "qwen-code"
  | "replit"
  | "roo"
  | "trae"
  | "trae-cn"
  | "windsurf"
  | "zencoder";

// -----------------------------------------------------------------------------
// Agent Configuration
// -----------------------------------------------------------------------------

/**
 * Configuration for an AI coding agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
/**
 * Detection function type for checking if an agent is installed.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentDetectFn = () => Effect.Effect<
  boolean,
  PlatformError.PlatformError,
  FileSystem.FileSystem
>;

/**
 * Configuration for an AI coding agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentConfig {
  /** Unique identifier (e.g., "claude-code") */
  readonly id: AgentId;
  /** Human-readable display name (e.g., "Claude Code") */
  readonly name: string;
  /** Skills installation configuration */
  readonly skills: AgentSkillsConfig;
  /** Optional custom detection function. If not provided, default heuristic is used. */
  readonly detect?: AgentDetectFn;
}

// -----------------------------------------------------------------------------
// Agent Registry
// -----------------------------------------------------------------------------

/**
 * Registry of all known agents, keyed by agent ID for O(1) lookup.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AgentRegistry = Record.ReadonlyRecord<AgentId, AgentConfig>;

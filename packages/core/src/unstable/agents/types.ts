/**
 * Type definitions for AI coding agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Record } from "effect";
import { CONFIGURABLE_AGENT_IDS, type ConfigurableAgentId } from "../agent-capabilities/catalog.js";
import type {
  DetectionMarker,
  Scope,
  ScopeDetection,
  SkillReadPath,
} from "../agent-capabilities/schema.js";

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
  /** Additional native directories read for discovery. AXM never writes to these paths. */
  readonly additionalReadPaths: ReadonlyArray<SkillReadPath>;
}

// -----------------------------------------------------------------------------
// Agent Commands Configuration
// -----------------------------------------------------------------------------

/**
 * Commands-specific configuration for an agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentCommandsDescriptor {
  /** Primary commands directory, relative to cwd (e.g., ".claude/commands") */
  readonly dir: string;
  /**
   * Scopes the agent itself supports for commands. `dir` is a single
   * workspace-relative path, so AXM writes project scope only; a "user" entry
   * here means the agent has a user-scope surface AXM does not manage yet.
   */
  readonly scopes: ReadonlyArray<Scope>;
}

// -----------------------------------------------------------------------------
// Agent Subagents Configuration
// -----------------------------------------------------------------------------

/**
 * Subagents-specific configuration for an agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentSubagentsDescriptor {
  /** Subagents directory, relative to cwd (e.g., ".claude/agents") */
  readonly dir: string;
  /**
   * Scopes the agent itself supports for subagents. See
   * {@link AgentCommandsDescriptor.scopes}.
   */
  readonly scopes: ReadonlyArray<Scope>;
  /**
   * When true, the path is a single file (e.g., ".roomodes") rather than a
   * directory containing subagent files.
   */
  readonly isFile?: boolean;
}

// -----------------------------------------------------------------------------
// Agent Instruction File Configuration
// -----------------------------------------------------------------------------

/**
 * Workspace instruction-file convention for one coding agent.
 *
 * `rulesDir` on the file-based variants is a *secondary* native rules directory
 * the agent also reads alongside its instruction file (e.g. Cursor reads both
 * `AGENTS.md` and `.cursor/rules`). AXM does not write it — the field exists so
 * status output can say so rather than silently reporting the agent as fully
 * synced.
 *
 * @experimental
 */
export type AgentInstructionsDescriptor =
  | { readonly kind: "agents-md"; readonly rulesDir?: string }
  | {
      readonly kind: "own-file";
      readonly file: string;
      readonly importSyntax?: "at-path";
      readonly rulesDir?: string;
    }
  | { readonly kind: "rules-dir"; readonly dir: string; readonly format: "frontmatter" };

// -----------------------------------------------------------------------------
// Agent Detection Configuration
// -----------------------------------------------------------------------------

/** @experimental This API is unstable and may change without notice. */
export type AgentDetectionMarker = DetectionMarker;

/** @experimental This API is unstable and may change without notice. */
export type AgentScopeDetectionDescriptor = ScopeDetection;

/** @experimental This API is unstable and may change without notice. */
export interface AgentDetectionDescriptor {
  /** Project-scope markers resolved relative to the project root. */
  readonly project: AgentScopeDetectionDescriptor;
  /** User-scope markers resolved relative to home/config roots; executables use PATH. */
  readonly user: AgentScopeDetectionDescriptor;
}

// -----------------------------------------------------------------------------
// Agent Identifiers
// -----------------------------------------------------------------------------

/** @experimental This API is unstable and may change without notice. */
export { CONFIGURABLE_AGENT_IDS, type ConfigurableAgentId };

/** @experimental This API is unstable and may change without notice. */
export const AGENT_IDS = [...CONFIGURABLE_AGENT_IDS, "universal"] as const;

/** @experimental This API is unstable and may change without notice. */
export type AgentId = (typeof AGENT_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export const isConfigurableAgentId = (id: AgentId): id is ConfigurableAgentId => id !== "universal";

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
  /**
   * Per-agent native configuration root, relative to the workspace root
   * (e.g., `.claude` for Claude Code, `.cursor` for Cursor). The
   * workspace read-model scanners look for this agent's `settings.json`,
   * `mcp.json`, and other native config files inside this directory.
   *
   * Three states (with `exactOptionalPropertyTypes: true`):
   *
   * - `string` — use this directory as the explicit native config root.
   * - omitted (key not present) — fall back to the first-segment heuristic
   *   (the first segment of `skills.dir`).
   * - `undefined` — explicit opt-out. Scanners SHALL NOT attempt to
   *   discover native config for this agent. Use this when an agent's
   *   first `skills.dir` segment collides with another agent's (e.g.,
   *   several agents share a parent like `.agents`) and there is no
   *   authoritative answer about the real native config root.
   */
  readonly rootDir?: string | undefined;
  /** Skills installation configuration */
  readonly skills: AgentSkillsDescriptor;
  /** Commands installation configuration (optional — not all agents support commands) */
  readonly commands?: AgentCommandsDescriptor;
  /** Subagents installation configuration (optional — not all agents support subagents) */
  readonly subagents?: AgentSubagentsDescriptor;
  /** Workspace instruction-file convention for this coding agent. */
  readonly instructions?: AgentInstructionsDescriptor;
  /** Structured per-scope markers used by agent detection. */
  readonly detection: AgentDetectionDescriptor;
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

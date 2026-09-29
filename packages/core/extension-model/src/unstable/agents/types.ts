/**
 * Type definitions for AI coding agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Record } from "effect";
import {
  CONFIGURABLE_AGENT_IDS,
  type ConfigurableAgentId,
} from "../agent-capabilities/identity.js";
import type {
  DetectionMarker,
  Scope,
  ScopeDetection,
  NativeReadLocation,
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
  readonly locations: ReadonlyArray<NativeReadLocation>;
  readonly scopes: ReadonlyArray<Scope>;
  readonly writerSupported: boolean;
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
  readonly locations: ReadonlyArray<NativeReadLocation>;
  readonly scopes: ReadonlyArray<Scope>;
  readonly writerSupported: boolean;
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
export interface AgentInstructionsDescriptor {
  readonly kind: "agents-md" | "own-file" | "rules-dir";
  readonly locations: ReadonlyArray<NativeReadLocation>;
  readonly scopes: ReadonlyArray<Scope>;
  readonly writerSupported: boolean;
  readonly importSyntax?: "at-path";
}

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

/** Real agents that can participate in native materialization. @experimental */
export const MATERIALIZATION_TARGET_IDS = [...CONFIGURABLE_AGENT_IDS] as const;

/** @experimental This API is unstable and may change without notice. */
export type MaterializationTargetId = (typeof MATERIALIZATION_TARGET_IDS)[number];

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
  readonly id: MaterializationTargetId;
  /** Human-readable display name (e.g., "Claude Code") */
  readonly name: string;
  /** Explicit project native configuration root. Undefined suppresses root discovery. */
  readonly rootDir?: string | undefined;
  /** Native Skill reader declarations, independent of AXM writer support. */
  readonly skills?: AgentSkillsDescriptor;
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
export type AgentRegistry = Record.ReadonlyRecord<MaterializationTargetId, AgentDescriptor>;

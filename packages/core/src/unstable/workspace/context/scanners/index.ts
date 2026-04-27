/**
 * Scanner barrel: re-exports every per-scanner factory and the shared
 * occurrence-shape types from one entry point so `context.ts` can pull
 * scanner wiring from a single module.
 *
 * Each scanner module owns its own deps interface, occurrence shape, and
 * partial-failure semantics; this barrel only re-exports — no logic.
 */

// ---------------------------------------------------------------------------
// Canonical-extensions scanner
// ---------------------------------------------------------------------------

export {
  makeCanonicalExtensionsScanner,
  type CanonicalExtensionsScannerDeps,
} from "./canonical-extensions.js";

// ---------------------------------------------------------------------------
// Agent-directory scanner
// ---------------------------------------------------------------------------

export { makeAgentDirScanner, type AgentDirScannerDeps } from "./agent-dir.js";

// ---------------------------------------------------------------------------
// MCP-config scanner (workspace + per-agent)
// ---------------------------------------------------------------------------

export { makeMcpConfigScanner, type McpConfigScannerDeps } from "./mcp-config.js";

// ---------------------------------------------------------------------------
// Agent-settings scanner
// ---------------------------------------------------------------------------

export { makeAgentSettingsScanner, type AgentSettingsScannerDeps } from "./agent-settings.js";

// ---------------------------------------------------------------------------
// Shared agent-root resolver used by both the agent-settings and mcp-config
// scanners.
// ---------------------------------------------------------------------------

export {
  agentRootSegment,
  detectAgentRootCollisions,
  makeAgentRootResolverState,
  type AgentRootResolverState,
} from "./agent-root.js";

// ---------------------------------------------------------------------------
// Shared occurrence-shape types and identity helpers
// ---------------------------------------------------------------------------

export {
  dedupeByIdentity,
  occurrenceIdentity,
  occurrenceIdentityKey,
  type AgentDirOccurrence,
  type AgentDirSubjectType,
  type AgentMcpConfigOccurrence,
  type AgentSettingsOccurrence,
  type CanonicalExtensionOccurrence,
  type CanonicalExtensionOriginKind,
  type McpConfigOccurrence,
  type McpConfigOriginKind,
  type OccurrenceIdentity,
  type ScannerOccurrence,
  type WorkspaceMcpConfigOccurrence,
} from "./types.js";

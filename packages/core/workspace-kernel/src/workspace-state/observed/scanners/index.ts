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

export { makeCanonicalExtensionsScanner } from "./canonical-extensions.js";

// ---------------------------------------------------------------------------
// Agent-directory scanner
// ---------------------------------------------------------------------------

export { makeAgentDirScanner } from "./agent-dir.js";

// ---------------------------------------------------------------------------
// MCP-config scanner (workspace + per-agent)
// ---------------------------------------------------------------------------

export { makeMcpConfigScanner } from "./mcp-config.js";

// ---------------------------------------------------------------------------
// Agent-settings scanner
// ---------------------------------------------------------------------------

export { makeAgentSettingsScanner } from "./agent-settings.js";

// ---------------------------------------------------------------------------
// Shared agent-root resolver used by both the agent-settings and mcp-config
// scanners.
// ---------------------------------------------------------------------------

export { type AgentRootResolverState } from "./agent-root.js";

// ---------------------------------------------------------------------------
// Shared occurrence-shape types and identity helpers
// ---------------------------------------------------------------------------

export {
  type AgentDirOccurrence,
  type AgentSettingsOccurrence,
  type CanonicalExtensionOccurrence,
  type McpConfigOccurrence,
} from "./types.js";

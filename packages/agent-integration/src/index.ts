/**
 * @agentxm/agent-integration public API.
 *
 * Effectful detection of installed AI coding agents plus native-surface path
 * primitives (home and config directories, catalog-derived agent install
 * paths). The environment-backed executable resolver layer lives behind
 * `./live`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Detection (effectful)
export {
  AgentExecutableResolver,
  detectAgent,
  detectAgentInRoot,
  detectAgentScopeResults,
  detectAgentScopes,
  detectAgents,
  detectAgentsForScope,
  detectAgentsInRoot,
  type AgentScopeDetection,
  type AgentExecutableResolverService,
} from "./detection.js";

// Failure vocabulary
export { AgentDetectionFailed, type AgentIntegrationError } from "./errors.js";

// Constants (path helpers)
export { getHome, getConfigHome } from "./constants.js";

// Catalog-derived agent path helpers
export {
  agentSkillsProjectDir,
  agentSubagentsProjectDir,
  agentSubagentsProjectDirOptional,
} from "./descriptor-paths.js";

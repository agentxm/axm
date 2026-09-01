/**
 * Agent detection module for @agentxm/extension-management.
 *
 * Provides effectful detection of installed agents plus native-surface
 * path primitives (home and config directories).
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Detection (effectful)
export {
  AgentExecutableResolver,
  AgentExecutableResolverLive,
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

// Constants (path helpers)
export { getHome, getConfigHome } from "./constants.js";

/** Discovery helpers that operate on arbitrary source directories. */

export {
  getPriorityDirectories,
  skillsInDir,
  type DiscoveredSkill,
  type DiscoveryOptions,
} from "./skills.js";
export { parsePluginManifests } from "./plugin-manifests.js";
export {
  scanAgentSubagentFiles,
  scanAllSubagentFiles,
  type AgentSubagentSummary,
  type DetectedSubagentFile,
} from "./subagents.js";

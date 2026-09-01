// Paths

// Rendering engine

// Registry ref builder

// Lock entry builder

// Manager service
export { SubagentManager, SubagentManagerLive, type SubagentManagerService } from "./manager.js";

// Operations
export {
  SUBAGENT_CONFIG_SURFACE,
  renderedSubagentTargets,
  subagentConfigTarget,
  subagentLifecycleArtifact,
} from "./operations/artifact.js";
export type { EnableSubagentOperation } from "./operations/enable.js";
export { enableSubagent } from "./operations/enable.js";
export type { DisableSubagentOperation } from "./operations/disable.js";
export { disableSubagent } from "./operations/disable.js";

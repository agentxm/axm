// Paths
export {
  computeSubagentPathsForLayout,
  subagentContentFilename,
  subagentContentPath,
  type SubagentPathSource,
  type SubagentDirPaths,
} from "./paths.js";

// Rendering engine
export {
  rendered,
  skipped,
  renderSubagent,
  selectSubagentRenderer,
  renderMarkdownYaml,
  renderToml,
  renderJson,
  buildRooModeEntry,
  mergeRooModes,
  removeRooMode,
  splitBody,
  type AgentOverrides,
  type SubagentRenderInput,
  type SubagentRenderOutput,
  type SubagentRenderOutcome,
  type SubagentRendered,
  type SubagentSkipped,
  type SubagentRenderer,
  type RooModeEntry,
  type RooModeResult,
} from "./rendering/index.js";

// Registry ref builder

// Lock entry builder
export { buildSubagentLockEntry } from "./lock-entry-builder.js";

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

/**
 * Subagents feature module — manifest schema, content parsing, and path computation.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Manifest schema
export {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_URL,
  SubagentManifestSchema,
  type SubagentManifest,
} from "./manifest-schema.js";

// Content parsing
export {
  parseSubagentMd,
  type SubagentAgentOverrides,
  type SubagentContentResult,
} from "./subagent-content.js";

// Paths
export {
  computeSubagentPaths,
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

// Refs
export type {
  GitHostedSubagentRef,
  RegistrySubagentRef,
  LocalSubagentRef,
  WorkspaceSubagentRef,
  SubagentExtensionRef,
} from "./refs.js";

// Registry ref builder

// Lock entry builder
export { buildSubagentLockEntry } from "./lock-entry-builder.js";

// Manager service
export { SubagentManager, SubagentManagerLive } from "./manager.js";

// Operations
export {
  SUBAGENT_CONFIG_SURFACE,
  renderedSubagentTargets,
  subagentConfigTarget,
  subagentContentSourcePath,
  subagentLifecycleArtifact,
  subagentManifestSourcePath,
  subagentScaffoldArtifact,
  subagentSourcePath,
} from "./operations/artifact.js";
export type { EnableSubagentOperation } from "./operations/enable.js";
export { enableSubagent } from "./operations/enable.js";
export type { DisableSubagentOperation } from "./operations/disable.js";
export { disableSubagent } from "./operations/disable.js";

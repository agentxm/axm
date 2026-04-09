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

// Tool access
export {
  TOOL_ACCESS_LEVELS,
  isToolAccessLevel,
  ToolAccessLevelSchema,
  type ToolAccessLevel,
} from "./tool-access.js";

// Content parsing
export {
  SubagentFrontmatterSchema,
  ManifestFieldsFromFrontmatterSchema,
  parseSubagentMd,
  projectFrontmatterToManifest,
  type SubagentFrontmatter,
  type SubagentContentResult,
  type ManifestFieldsFromFrontmatter,
} from "./subagent-content.js";

// Paths
export {
  SUBAGENT_CONTENT_FILENAME,
  computeSubagentPaths,
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
  mapModelTier,
  mapToolAccess,
  type AgentOverrides,
  type SubagentRenderInput,
  type SubagentRenderOutput,
  type SubagentRenderOutcome,
  type SubagentRendered,
  type SubagentSkipped,
  type SubagentRenderer,
  type ModelMappingResult,
  type ToolAccessMappingResult,
  type RooModeEntry,
  type RooModeResult,
} from "./rendering/index.js";

// Refs
export type {
  GitHostedSubagentRef,
  RegistrySubagentRef,
  LocalSubagentRef,
  SubagentExtensionRef,
} from "./refs.js";

// Registry ref builder
export { buildRegistrySubagentRef } from "./registry-ref-builder.js";

// Lock entry builder
export { buildSubagentLockEntry } from "./lock-entry-builder.js";

// Manager service
export { SubagentManager, SubagentManagerLive } from "./manager.js";

// Operations
export type {
  PublishSubagentOperationArgs,
  PublishSubagentOperation,
} from "./operations/publish.js";
export { publishSubagent } from "./operations/publish.js";
export type { EnableSubagentOperation } from "./operations/enable.js";
export { enableSubagent } from "./operations/enable.js";
export type { DisableSubagentOperation } from "./operations/disable.js";
export { disableSubagent } from "./operations/disable.js";

// Reconciliation adapter
export {
  subagentReconciliationAdapter,
  assertSubagentAdapterLoaded,
} from "./reconciliation-adapter.js";

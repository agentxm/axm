/**
 * Workspace-inspection feature: read-only assessment of the workspace's
 * extension inventory against registries and sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  ExtensionNotInstalled,
  PublishedMetadataUnavailable,
  WorkspaceInspectionFailed,
} from "./errors.js";

export type { ExtensionListFilter } from "./extension-list/assessment.js";

// Read-only application APIs.
export {
  ExtensionListDocumentSchema,
  ListExtensions,
  type ExtensionListDocument,
} from "./extension-list/list-extensions.js";
export {
  listHooks,
  listMcpServers,
  listPacks,
  listRules,
  listSkills,
  listSubagents,
  type PackListRow,
  type SkillListRow,
  type SourcedListRow,
  type TypeListResult,
} from "./type-list/type-lists.js";
export type { TypeListRow } from "./type-list/type-list-row.js";
export { McpServerListQueryResultSchema, type McpServerListRow } from "./type-list/mcp-servers.js";
export { RenderSubagent, SubagentRenderResultSchema } from "./show/render-subagent.js";
export {
  resolveViewHandle,
  resolveViewRegistry,
  VIEW_FIELDS,
  ViewDocumentSchema,
  ViewExtension,
  ViewFieldValueSchema,
  type ViewDocument,
  type ViewExtensionResult,
  type ViewFieldValue,
  type ViewTargetRegistry,
} from "./view/view-extension.js";
export {
  KnowledgeListQueryResultSchema,
  ListKnowledge,
  type KnowledgeListRow,
} from "./knowledge/list-knowledge.js";

export {
  ExtensionInventoryDocumentSchema,
  type ExtensionInventoryDocument,
} from "./inventory-document.js";
export { ExportLock, exportAcceptedResolutions } from "./lock-export.js";
export { LocalInspection } from "./show/local-inspection.js";
export {
  LocalInspectionDocumentSchema,
  type LocalInspectionDocument,
} from "./show/local-inspection-document.js";
export {
  inspectionSelectionIssue,
  type InspectionSelection,
  type LocalInspectionRequest,
} from "./show/local-inspection-selection.js";

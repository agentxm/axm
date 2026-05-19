/**
 * Context files feature module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  CONTEXT_FILES_EXTENSION_DIR,
  CONTEXT_FILES_MANIFEST_FILENAME,
  CONTEXT_FILES_MANIFEST_SCHEMA_URL,
  FileContentSourceSchema,
  FileContentsEntrySchema,
  FileGeneratorSpecSchema,
  FileInputDeclarationSchema,
  FileInputDeclarationsMapSchema,
  FileInputValueSchema,
  ContextFilesManifestSchema,
  FileMaterializationModeSchema,
  type FileContentSource,
  type FileContentsEntry,
  type FileGeneratorSpec,
  type FileInputDeclaration,
  type FileInputDeclarationsMap,
  type FileInputValue,
  type ContextFilesManifest,
  type FileMaterializationMode,
} from "./manifest-schema.js";

export {
  materializeFileEntry,
  renderFileContent,
  renderFileTemplate,
  type FileTemplateContext,
  type MaterializeFileEntryArgs,
  type MaterializeFileEntryResult,
  type RenderFileContentArgs,
} from "./materialization.js";

export { contextFilesPackagesInDir, type DiscoveredContextFilesPackage } from "./discovery.js";
export type {
  ContextFilesExtensionRef,
  GitHostedContextFilesRef,
  LocalContextFilesRef,
  RegistryContextFilesRef,
} from "./refs.js";
export {
  commentStyleForTarget,
  parseRegionMarker,
  replaceManagedRegion,
  serializeRegionMarker,
  stripManagedRegion,
  type FileCommentStyle,
  type FileRegionMarker,
  type FileRegionMarkerIdentity,
  type FileRegionMarkerKind,
  type ReplaceManagedRegionArgs,
} from "./markers.js";
export {
  extractMarkdownHeadings,
  generateFileIndex,
  generateTableOfContents,
  type FileIndexOptions,
  type TableOfContentsHeading,
} from "./generators.js";
export {
  renderWorkspaceGeneratorRegions,
  type RenderWorkspaceGeneratorRegionsArgs,
  type WorkspaceGeneratorRegionResult,
} from "./workspace-generators.js";
export { ContextFilesManager, ContextFilesManagerLive } from "./manager.js";

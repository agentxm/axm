/**
 * files feature module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  FILES_EXTENSION_DIR,
  FILES_MANIFEST_FILENAME,
  FILES_MANIFEST_SCHEMA_URL,
  FileContentSourceSchema,
  FileContentsEntrySchema,
  FileGeneratorSpecSchema,
  FileInputDeclarationSchema,
  FileInputDeclarationsMapSchema,
  FileInputValueSchema,
  FilesManifestSchema,
  FileMaterializationModeSchema,
  type FileContentSource,
  type FileContentsEntry,
  type FileGeneratorSpec,
  type FileInputDeclaration,
  type FileInputDeclarationsMap,
  type FileInputValue,
  type FilesManifest,
  type FileMaterializationMode,
} from "./manifest-schema.js";

export {
  materializeFileEntry,
  renderFileContent,
  renderFileTemplate,
  type FileTemplateFiles,
  type MaterializeFileEntryArgs,
  type MaterializeFileEntryResult,
  type RenderFileContentArgs,
} from "./materialization.js";

export { filesPackagesInDir, type DiscoveredFilesPackage } from "./discovery.js";
export type {
  FilesExtensionRef,
  GitHostedFilesRef,
  LocalFilesRef,
  RegistryFilesRef,
  WorkspaceFilesRef,
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
export { FilesManager, FilesManagerLive } from "./manager.js";
export { filesReconciliationAdapter } from "./reconciliation-adapter.js";

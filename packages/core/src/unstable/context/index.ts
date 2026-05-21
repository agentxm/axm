/**
 * context feature module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  CONTEXT_EXTENSION_DIR,
  CONTEXT_MANIFEST_FILENAME,
  CONTEXT_MANIFEST_SCHEMA_URL,
  FileContentSourceSchema,
  FileContentsEntrySchema,
  FileGeneratorSpecSchema,
  FileInputDeclarationSchema,
  FileInputDeclarationsMapSchema,
  FileInputValueSchema,
  ContextManifestSchema,
  FileMaterializationModeSchema,
  type FileContentSource,
  type FileContentsEntry,
  type FileGeneratorSpec,
  type FileInputDeclaration,
  type FileInputDeclarationsMap,
  type FileInputValue,
  type ContextManifest,
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

export { contextPackagesInDir, type DiscoveredContextPackage } from "./discovery.js";
export type {
  ContextExtensionRef,
  GitHostedContextRef,
  LocalContextRef,
  RegistryContextRef,
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
export { ContextManager, ContextManagerLive } from "./manager.js";

/**
 * docs feature module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  DOCS_EXTENSION_DIR,
  DOCS_MANIFEST_FILENAME,
  DOCS_MANIFEST_SCHEMA_URL,
  FileContentSourceSchema,
  FileContentsEntrySchema,
  FileGeneratorSpecSchema,
  FileInputDeclarationSchema,
  FileInputDeclarationsMapSchema,
  FileInputValueSchema,
  DocsManifestSchema,
  FileMaterializationModeSchema,
  type FileContentSource,
  type FileContentsEntry,
  type FileGeneratorSpec,
  type FileInputDeclaration,
  type FileInputDeclarationsMap,
  type FileInputValue,
  type DocsManifest,
  type FileMaterializationMode,
} from "./manifest-schema.js";

export {
  materializeFileEntry,
  renderFileContent,
  renderFileTemplate,
  type FileTemplateDocs,
  type MaterializeFileEntryArgs,
  type MaterializeFileEntryResult,
  type RenderFileContentArgs,
} from "./materialization.js";

export { docsPackagesInDir, type DiscoveredDocsPackage } from "./discovery.js";
export type { DocsExtensionRef, GitHostedDocsRef, LocalDocsRef, RegistryDocsRef } from "./refs.js";
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
export { DocsManager, DocsManagerLive } from "./manager.js";

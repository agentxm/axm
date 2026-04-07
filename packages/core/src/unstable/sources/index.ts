/**
 * Source parsing and identification module for @axm.sh/core.
 *
 * Source providers and parsing utilities. Extension ref types live in
 * the extensions module (`extensions/refs.ts`, `extensions/ref-base.ts`)
 * — import them from `@axm.sh/core/unstable/extensions`.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Types — Core
export type { RefType, SourceType } from "./types.js";
export {
  RefTypeSchema,
  SourceTypeSchema,
  SourceSegmentSchema,
  SourceRefSchema,
  SourceSubPathSchema,
  GitHostedSourceParamPartsSchema,
  AzureReposSourceParamPartsSchema,
  GitHubSourceParamsSchema,
  GitLabSourceParamsSchema,
  BitbucketSourceParamsSchema,
  AzureReposSourceParamsSchema,
} from "./types.js";
export type { GitHostedSourceParamParts, AzureReposSourceParamParts } from "./types.js";

// Types — Source domain model
export type {
  // SourceHost
  AzureReposSourceHost,
  BitbucketSourceHost,
  ConfiguredSourceHost,
  GitHostingSourceHost,
  GitHubSourceHost,
  GitLabSourceHost,
  GitSourceHost,
  LocalSourceHost,
  RegistrySourceHost,
  SelfDescribingSourceHost,
  SourceHost,
  // SourceParams
  AzureReposSourceParams,
  BitbucketSourceParams,
  GitHubSourceParams,
  GitHostingSourceParams,
  GitLabSourceParams,
  GitSourceParams,
  LocalSourceParams,
  RegistrySourceParams,
  SourceParams,
  // Source (flat intersection)
  GitBasedSource,
  GitHostingSource,
  AzureReposSource,
  BitbucketSource,
  GitHubSource,
  GitLabSource,
  GitSource,
  LocalSource,
  RegistrySource,
  Source,
} from "./types.js";

// Type guards and utilities
export { fileUrlToPath } from "./utils.js";

// Provider types
export type { ExtensionFiles, FindOptions, SourceHostProvider } from "./provider.js";

// Input pattern classifier
export { parseInputPattern } from "./parser.js";
export type { InputPattern, InputParseResult, ShorthandInput } from "./parser.js";

// Printer
export { lockEntryToSourceParams, printSourceParams } from "./printer.js";

// Source-to-lock-entry mapping
export { sourceToLockEntry, type SourceToLockEntryInput } from "./source-to-lock-entry.js";

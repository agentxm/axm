/**
 * Concrete docs package ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  DocsExtensionRefBase,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
} from "../extensions/ref-base.js";
import type { GitBasedSource, LocalSource, RegistrySource } from "../sources/types.js";

/** @experimental */
export type GitHostedDocsRef = DocsExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryDocsRef = DocsExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type LocalDocsRef = DocsExtensionRefBase<"local", LocalSource> & LocalRefDetails;

/** @experimental */
export type DocsExtensionRef = GitHostedDocsRef | RegistryDocsRef | LocalDocsRef;

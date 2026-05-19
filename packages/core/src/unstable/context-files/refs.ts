/**
 * Concrete context files package ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  ContextFilesExtensionRefBase,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
} from "../extensions/ref-base.js";
import type { GitBasedSource, LocalSource, RegistrySource } from "../sources/types.js";

/** @experimental */
export type GitHostedContextFilesRef = ContextFilesExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryContextFilesRef = ContextFilesExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalContextFilesRef = ContextFilesExtensionRefBase<"local", LocalSource> &
  LocalRefDetails;

/** @experimental */
export type ContextFilesExtensionRef =
  | GitHostedContextFilesRef
  | RegistryContextFilesRef
  | LocalContextFilesRef;

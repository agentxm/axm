/**
 * Concrete context package ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  ContextExtensionRefBase,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
} from "../extensions/ref-base.js";
import type { GitBasedSource, LocalSource, RegistrySource } from "../sources/types.js";

/** @experimental */
export type GitHostedContextRef = ContextExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryContextRef = ContextExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalContextRef = ContextExtensionRefBase<"local", LocalSource> & LocalRefDetails;

/** @experimental */
export type ContextExtensionRef = GitHostedContextRef | RegistryContextRef | LocalContextRef;

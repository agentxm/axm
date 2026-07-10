/**
 * Concrete command extension ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  CommandExtensionRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
  WorkspaceRefDetails,
} from "../extensions/ref-base.js";
import type {
  GitBasedSource,
  RegistrySource,
  LocalSource,
  WorkspaceSource,
} from "../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete Command Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedCommandRef = CommandExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryCommandRef = CommandExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalCommandRef = CommandExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type WorkspaceCommandRef = CommandExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;

/** @experimental */
export type CommandExtensionRef =
  | GitHostedCommandRef
  | RegistryCommandRef
  | LocalCommandRef
  | WorkspaceCommandRef;

/**
 * Concrete subagent extension ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  SubagentExtensionRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
  WorkspaceRefDetails,
} from "./ref-base.js";
import type {
  GitBasedSource,
  RegistrySource,
  LocalSource,
  WorkspaceSource,
} from "../../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete Subagent Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedSubagentRef = SubagentExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistrySubagentRef = SubagentExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalSubagentRef = SubagentExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type WorkspaceSubagentRef = SubagentExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;

/** @experimental */
export type SubagentExtensionRef =
  GitHostedSubagentRef | RegistrySubagentRef | LocalSubagentRef | WorkspaceSubagentRef;

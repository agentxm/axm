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
} from "../extensions/ref-base.js";
import type { GitBasedSource, RegistrySource, LocalSource } from "../sources/types.js";

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
export type SubagentExtensionRef = GitHostedSubagentRef | RegistrySubagentRef | LocalSubagentRef;

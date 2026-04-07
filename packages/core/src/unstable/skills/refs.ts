/**
 * Skill extension ref types.
 *
 * Concrete ref types for skill extensions, built on the shared
 * ExtensionRefBase and ref detail interfaces.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  SkillExtensionRefBase,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
} from "../extensions/ref-base.js";
import type { GitBasedSource, RegistrySource, LocalSource } from "../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete Skill Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedSkillRef = SkillExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistrySkillRef = SkillExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalSkillRef = SkillExtensionRefBase<"local", LocalSource> & LocalRefDetails;

/** @experimental */
export type SkillExtensionRef = GitHostedSkillRef | RegistrySkillRef | LocalSkillRef;

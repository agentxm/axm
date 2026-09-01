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
  WorkspaceRefDetails,
} from "./ref-base.js";
import type {
  GitBasedSource,
  RegistrySource,
  LocalSource,
  WorkspaceSource,
} from "../../sources/types.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";

type ExternalSkillRefDetails<TDetails extends GitHostedRefDetails | LocalRefDetails> = Omit<
  TDetails,
  "owner"
> & {
  readonly owner?: Handle;
  readonly portable?: boolean;
};

// -----------------------------------------------------------------------------
// Layer 3: Concrete Skill Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedSkillRef = SkillExtensionRefBase<"git-hosted", GitBasedSource> &
  ExternalSkillRefDetails<GitHostedRefDetails>;
/** @experimental */
export type RegistrySkillRef = SkillExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalSkillRef = SkillExtensionRefBase<"local", LocalSource> &
  ExternalSkillRefDetails<LocalRefDetails>;
/** @experimental */
export type WorkspaceSkillRef = SkillExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;

/** @experimental */
export type SkillExtensionRef =
  GitHostedSkillRef | RegistrySkillRef | LocalSkillRef | WorkspaceSkillRef;

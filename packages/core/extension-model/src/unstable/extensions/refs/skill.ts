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
  HttpRefDetails,
  GitHostedRefDetails,
  RegistryRefDetails,
  LocalRefDetails,
  WorkspaceRefDetails,
} from "./ref-base.js";
import type {
  GitBasedSource,
  HttpSource,
  RegistrySource,
  LocalSource,
  WorkspaceSource,
} from "../../sources/types.js";
import type { Handle } from "../handle.js";

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
export type HttpSkillRef = SkillExtensionRefBase<"http", HttpSource> &
  Omit<HttpRefDetails, "owner"> & { readonly owner?: Handle };

export type SkillExtensionRef =
  HttpSkillRef | GitHostedSkillRef | RegistrySkillRef | LocalSkillRef | WorkspaceSkillRef;

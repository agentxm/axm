import type { ExtensionName } from "../extensions/common.js";
import type {
  ExtensionRefBase,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
  WorkspaceRefDetails,
} from "../extensions/ref-base.js";
import type {
  GitBasedSource,
  LocalSource,
  RegistrySource,
  WorkspaceSource,
} from "../sources/types.js";

type KnowledgeExtensionRefBase<TRefType, TSource> = ExtensionRefBase<
  "knowledge",
  Extract<TRefType, "git-hosted" | "registry" | "local" | "workspace">,
  Extract<TSource, GitBasedSource | RegistrySource | LocalSource | WorkspaceSource>
> & { readonly knowledge: { readonly name: ExtensionName } };

export type GitHostedKnowledgeRef = KnowledgeExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
export type RegistryKnowledgeRef = KnowledgeExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
export type LocalKnowledgeRef = KnowledgeExtensionRefBase<"local", LocalSource> & LocalRefDetails;
export type WorkspaceKnowledgeRef = KnowledgeExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;
export type KnowledgeExtensionRef =
  GitHostedKnowledgeRef | RegistryKnowledgeRef | LocalKnowledgeRef | WorkspaceKnowledgeRef;

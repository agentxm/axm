import type { ExtensionName } from "../common.js";
import type {
  ExtensionRefBase,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
  WorkspaceRefDetails,
} from "./ref-base.js";
import type {
  GitBasedSource,
  LocalSource,
  RegistrySource,
  WorkspaceSource,
} from "../../sources/types.js";

type KnowledgeExtensionRefBase<TRefType, TSource> = ExtensionRefBase<
  "knowledge",
  Extract<TRefType, "git-hosted" | "registry" | "local" | "workspace">,
  Extract<TSource, GitBasedSource | RegistrySource | LocalSource | WorkspaceSource>
> & {
  readonly knowledge: {
    readonly name: ExtensionName;
    /** What the package's manifest says it is for, where discovery read one. */
    readonly description?: string;
  };
};

export type GitHostedKnowledgeRef = KnowledgeExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
export type RegistryKnowledgeRef = KnowledgeExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
export type LocalKnowledgeRef = KnowledgeExtensionRefBase<"local", LocalSource> & LocalRefDetails;
export type WorkspaceKnowledgeRef = KnowledgeExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;
export type KnowledgeExtensionRef =
  GitHostedKnowledgeRef | RegistryKnowledgeRef | LocalKnowledgeRef | WorkspaceKnowledgeRef;

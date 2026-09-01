/**
 * Concrete hook ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRefBase } from "./ref-base.js";
import type {
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
} from "@agentxm/extension-model/unstable/sources/types";

type HookExtensionRefBase<TRefType, TSource> = ExtensionRefBase<
  "hook",
  Extract<TRefType, "git-hosted" | "registry" | "local" | "workspace">,
  Extract<TSource, GitBasedSource | RegistrySource | LocalSource | WorkspaceSource>
> & {
  readonly hook: { readonly name: ExtensionName };
  /** Override platform capability degradation for this extension. */
  readonly fallback?: "auto" | "none";
};

/** @experimental */
export type GitHostedHookRef = HookExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryHookRef = HookExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type LocalHookRef = HookExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type WorkspaceHookRef = HookExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;

/** @experimental */
export type HookExtensionRef = GitHostedHookRef | RegistryHookRef | LocalHookRef | WorkspaceHookRef;

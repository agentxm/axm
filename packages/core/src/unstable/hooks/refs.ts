/**
 * Concrete hook ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionName } from "../extensions/common.js";
import type { ExtensionRefBase } from "../extensions/ref-base.js";
import type {
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
} from "../extensions/ref-base.js";
import type { GitBasedSource, LocalSource, RegistrySource } from "../sources/types.js";

type HookExtensionRefBase<TRefType, TSource> = ExtensionRefBase<
  "hook",
  Extract<TRefType, "git-hosted" | "registry" | "local">,
  Extract<TSource, GitBasedSource | RegistrySource | LocalSource>
> & {
  readonly hook: { readonly name: ExtensionName };
};

/** @experimental */
export type GitHostedHookRef = HookExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryHookRef = HookExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type LocalHookRef = HookExtensionRefBase<"local", LocalSource> & LocalRefDetails;

/** @experimental */
export type HookExtensionRef = GitHostedHookRef | RegistryHookRef | LocalHookRef;

import type { HttpSource } from "../../sources/types.js";
import type { HttpRefDetails } from "./ref-base.js";
/**
 * Concrete hook ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionName } from "../common.js";
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
} from "../../sources/types.js";

type HookExtensionRefBase<TRefType, TSource> = ExtensionRefBase<
  "hook",
  Extract<TRefType, "git-hosted" | "registry" | "local" | "workspace" | "http">,
  Extract<TSource, GitBasedSource | RegistrySource | LocalSource | WorkspaceSource | HttpSource>
> & {
  readonly hook: {
    readonly name: ExtensionName;
    /** What the package's manifest says it is for, where discovery read one. */
    readonly description?: string;
  };
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
export type HttpHookRef = HookExtensionRefBase<"http", HttpSource> & HttpRefDetails;

export type HookExtensionRef =
  HttpHookRef | GitHostedHookRef | RegistryHookRef | LocalHookRef | WorkspaceHookRef;

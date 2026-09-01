/**
 * Concrete rule ref types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
  WorkspaceRefDetails,
} from "./ref-base.js";
import type { ExtensionRefBase } from "./ref-base.js";
import type {
  GitBasedSource,
  LocalSource,
  RegistrySource,
  WorkspaceSource,
} from "@agentxm/extension-model/unstable/sources/types";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions/common";

type RuleExtensionRefBase<TRefType, TSource> = ExtensionRefBase<
  "rule",
  Extract<TRefType, "git-hosted" | "registry" | "local" | "workspace">,
  Extract<TSource, GitBasedSource | RegistrySource | LocalSource | WorkspaceSource>
> & {
  readonly rule: { readonly name: ExtensionName };
};

/** @experimental */
export type GitHostedRuleRef = RuleExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryRuleRef = RuleExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type LocalRuleRef = RuleExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type WorkspaceRuleRef = RuleExtensionRefBase<"workspace", WorkspaceSource> &
  WorkspaceRefDetails;

/** @experimental */
export type RuleExtensionRef = GitHostedRuleRef | RegistryRuleRef | LocalRuleRef | WorkspaceRuleRef;

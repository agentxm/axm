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
} from "../extensions/ref-base.js";
import type { ExtensionRefBase } from "../extensions/ref-base.js";
import type { GitBasedSource, LocalSource, RegistrySource } from "../sources/types.js";
import type { ExtensionName } from "../extensions/common.js";

type RuleExtensionRefBase<TRefType, TSource> = ExtensionRefBase<
  "rule",
  Extract<TRefType, "git-hosted" | "registry" | "local">,
  Extract<TSource, GitBasedSource | RegistrySource | LocalSource>
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
export type RuleExtensionRef = GitHostedRuleRef | RegistryRuleRef | LocalRuleRef;

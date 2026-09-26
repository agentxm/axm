/**
 * The typed identity of a desired node: who is authoritative for the
 * package a node names, and the name it carries under that authority. The
 * desired-state graph is its only producer; every consumer reads the fields
 * instead of re-parsing a prefixed string.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

/** Who is authoritative for the package a desired node names. */
export type DesiredAuthority = "workspace" | "registry" | "git" | "path" | "bundled" | "inline";

/** The configured Registry a registry-authoritative node binds to. */
export interface DesiredRegistryBinding {
  /**
   * The configured source name the declaration binds to: the one it spells,
   * or the effective default Registry. A Pack member declared with an explicit
   * Registry endpoint names no configured source.
   */
  readonly sourceName: string | undefined;
  /** The Registry endpoint the binding resolves to, when one is configured. */
  readonly endpoint: URL | undefined;
}

/** A desired node's identity under one authority. */
export type DesiredNodeIdentity =
  | {
      /** Authored in this workspace under the configured owner. */
      readonly authority: "workspace";
      readonly fqn: string;
    }
  | {
      /** Shipped with AXM itself. */
      readonly authority: "bundled";
      readonly fqn: string;
    }
  | {
      /** Published by a Registry. */
      readonly authority: "registry";
      readonly fqn: string;
      readonly registry: DesiredRegistryBinding;
      /**
       * The accepted-resolution key an MCP source closure is recorded under:
       * the lock removal key and the secret-store namespace. Present only for
       * an MCP server whose Registry endpoint is known.
       */
      readonly resolutionKey?: string;
    }
  | {
      /** Acquired from a git repository or a local path the declaration spells. */
      readonly authority: "git" | "path";
      readonly locator: string;
      /** The name accepted state gives the package, once it has been resolved. */
      readonly fqn?: string;
    }
  | {
      /** An MCP connection the settings define in place. */
      readonly authority: "inline";
      readonly name: string;
    };

/** A Pack that routes a member: the authority it is held under, and its name. */
export interface DesiredPackIdentity {
  readonly authority: Exclude<DesiredAuthority, "inline" | "bundled">;
  readonly fqn: string;
}

/**
 * The source a Pack member inherits from the Pack that declares it, or is
 * declared with. `packMemberSourceAuthority` is its only producer for inherited
 * members and documents the canonical spelling of each variant.
 */
export type DesiredSourceAuthority =
  | { readonly authority: "workspace"; readonly fqn: string }
  | { readonly authority: "registry"; readonly endpoint: URL }
  | {
      readonly authority: "path";
      /** The workspace-relative source view root, as the lock records it. */
      readonly root: string;
    }
  | {
      readonly authority: "git";
      readonly url: URL;
      readonly revision: string;
      /** The repository subdirectory the source view was rooted at, when one was named. */
      readonly root: Option.Option<string>;
    };

/** The fully qualified name an identity carries, when its authority gives it one. */
export const desiredIdentityFqn = (identity: DesiredNodeIdentity): Option.Option<string> =>
  identity.authority === "inline" ? Option.none() : Option.fromUndefinedOr(identity.fqn);

/**
 * The name the identity compares under: its FQN, its locator, or its inline
 * name. Two nodes name the same package when these agree, whatever authority
 * each holds it under.
 */
export const desiredPackageKey = (identity: DesiredNodeIdentity): string => {
  switch (identity.authority) {
    case "workspace":
    case "bundled":
    case "registry":
      return identity.fqn;
    case "git":
    case "path":
      return identity.fqn ?? identity.locator;
    case "inline":
      return identity.name;
  }
};

/** Whether two identities name one package, regardless of authority. */
export const sameDesiredPackage = (left: DesiredNodeIdentity, right: DesiredNodeIdentity) =>
  desiredPackageKey(left) === desiredPackageKey(right);

/** Terminal text for one identity: its authority and the name it carries. */
export const formatDesiredIdentity = (identity: DesiredNodeIdentity): string => {
  switch (identity.authority) {
    case "workspace":
    case "bundled":
      return `${identity.authority}:${identity.fqn}`;
    case "registry":
      return identity.fqn;
    case "git":
    case "path":
      return identity.locator;
    case "inline":
      return `inline:${identity.name}`;
  }
};

/**
 * The key one sourced MCP node's source closure is recorded under: its
 * accepted-resolution key when the Registry endpoint is known, else its
 * authority and name. Every local connection to one source shares this key;
 * it is the lock removal key and the secret-store namespace, so it is opaque
 * to every consumer.
 */
export const desiredMcpSourceKey = (identity: DesiredNodeIdentity): string =>
  identity.authority === "registry" && identity.resolutionKey !== undefined
    ? identity.resolutionKey
    : formatDesiredIdentity(identity);

/** Whether two identities hold one package under one authority. */
export const sameDesiredIdentity = (left: DesiredNodeIdentity, right: DesiredNodeIdentity) =>
  left.authority === right.authority && desiredMcpSourceKey(left) === desiredMcpSourceKey(right);

/** Terminal text for one source authority. */
export const formatDesiredSourceAuthority = (authority: DesiredSourceAuthority): string => {
  switch (authority.authority) {
    case "workspace":
      return `workspace:${authority.fqn}`;
    case "registry":
      return `registry:${authority.endpoint.href}`;
    case "path":
      return `path:${authority.root}`;
    case "git":
      return `git:${authority.url.href}#${authority.revision}${Option.match(authority.root, {
        onNone: () => "",
        onSome: (root) => `//${root}`,
      })}`;
  }
};

/** Whether two source authorities are one authority. */
export const sameDesiredSourceAuthority = (
  left: DesiredSourceAuthority,
  right: DesiredSourceAuthority,
): boolean => formatDesiredSourceAuthority(left) === formatDesiredSourceAuthority(right);

/**
 * The authority a source locator that is neither a workspace nor a Registry
 * locator declares: a local path, or otherwise a git repository, which is
 * every remaining spelling the source grammar resolves.
 */
export const locatorAuthority = (locator: string): "git" | "path" =>
  Option.match(parseInputPattern(locator), {
    onNone: () => "git",
    onSome: (parsed) => (parsed.pattern.pattern === "file-path-pattern" ? "path" : "git"),
  });

/**
 * The identity an install request proposes: what one resolved reference would
 * make the workspace hold for the target it names.
 */
export const desiredIdentityOfRef = (ref: ExtensionRef): DesiredNodeIdentity => {
  const fqn = `${ref.owner}/${toExtensionTypePlural(ref.type)}/${extensionRefName(ref)}`;
  switch (ref.refType) {
    case "workspace":
      return { authority: "workspace", fqn };
    case "registry":
      return {
        authority: "registry",
        fqn,
        registry: { sourceName: undefined, endpoint: ref.source.location },
      };
    case "local":
      return { authority: "path", locator: printSourceParams(ref.source), fqn };
    case "git-hosted":
      return { authority: "git", locator: printSourceParams(ref.source), fqn };
  }
};

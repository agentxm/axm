/**
 * The typed identity of a desired node: who is authoritative for the
 * package a node names, and the name it carries under that authority. The
 * desired-state graph is its only producer; every consumer reads the fields
 * instead of re-parsing a prefixed string.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import {
  sameRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  httpSourceKind,
  type HttpArtifactSnapshot,
} from "@agentxm/extension-model/unstable/sources/http-artifact";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  isGitLockEntry,
  isHttpLockEntry,
  isPathLockEntry,
  isRegistryLockEntry,
  type LockEntry,
} from "./lock-entry.js";
import { McpSourceKey, type McpSourceIdentity } from "./mcp-source-identity.js";
import { canonicalSourceLocator } from "./source-locator.js";

/** Who is authoritative for the package a desired node names. */
export type DesiredAuthority =
  "workspace" | "registry" | "git" | "http" | "path" | "bundled" | "inline";

/** The configured Registry a registry-authoritative node binds to. */
interface DesiredRegistryBinding {
  /**
   * The configured source name the declaration binds to: the one it spells,
   * or the effective default Registry. A Pack member declared with an explicit
   * Registry endpoint names no configured source.
   */
  readonly sourceName: string | undefined;
  /** The Registry endpoint the binding resolves to, when one is configured. */
  readonly endpoint: RegistryEndpoint | undefined;
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
    }
  | {
      /** Acquired from a git repository or a local path the declaration spells. */
      readonly authority: "git" | "http" | "path";
      readonly locator: string;
      /** The name accepted state gives the package, once it has been resolved. */
      readonly fqn?: string;
      /** The accepted MCP source an MCP declaration resolved to, when exactly one row matches. */
      readonly acceptedSource?: McpSourceIdentity;
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
  | { readonly authority: "registry"; readonly endpoint: RegistryEndpoint }
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
    case "http":
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
    case "http":
    case "git":
    case "path":
      return identity.locator;
    case "inline":
      return `inline:${identity.name}`;
  }
};

/**
 * Whether two identities hold one package from one source: the same
 * authority and FQN, and the same canonical Registry endpoint or canonical
 * locator spelling. A
 * Registry identity with no bound endpoint equals nothing, because which
 * Registry it names is not known. Configured aliases and display text take
 * no part.
 */
export const sameSourceIdentity = (
  left: DesiredNodeIdentity,
  right: DesiredNodeIdentity,
): boolean => {
  switch (left.authority) {
    case "workspace":
    case "bundled":
      return right.authority === left.authority && right.fqn === left.fqn;
    case "registry":
      return (
        right.authority === "registry" &&
        left.registry.endpoint !== undefined &&
        right.registry.endpoint !== undefined &&
        sameRegistryEndpoint(left.registry.endpoint, right.registry.endpoint) &&
        left.fqn === right.fqn
      );
    case "git":
    case "http":
    case "path":
      return (
        right.authority === left.authority &&
        canonicalSourceLocator(right.locator) === canonicalSourceLocator(left.locator) &&
        right.fqn === left.fqn
      );
    case "inline":
      return right.authority === "inline" && right.name === left.name;
  }
};

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

/** Whether two source authorities are one authority, compared field by field. */
export const sameSourceAuthority = (
  left: DesiredSourceAuthority,
  right: DesiredSourceAuthority,
): boolean => {
  switch (left.authority) {
    case "workspace":
      return right.authority === "workspace" && right.fqn === left.fqn;
    case "registry":
      return right.authority === "registry" && sameRegistryEndpoint(left.endpoint, right.endpoint);
    case "path":
      return right.authority === "path" && right.root === left.root;
    case "git":
      return (
        right.authority === "git" &&
        right.url.href === left.url.href &&
        right.revision === left.revision &&
        Option.getOrUndefined(right.root) === Option.getOrUndefined(left.root)
      );
  }
};

const sameLockSource = (left: LockEntry["source"], right: LockEntry["source"]): boolean => {
  switch (left.type) {
    case "registry":
      return right.type === "registry" && sameRegistryEndpoint(left.url, right.url);
    case "git":
      return (
        right.type === "git" &&
        right.url.href === left.url.href &&
        right.path === left.path &&
        right.revision === left.revision
      );
    case "http":
      return right.type === "http" && right.url.href === left.url.href && right.path === left.path;
    case "path":
      return right.type === "path" && right.path === left.path;
  }
};

const sameHttpArtifact = (
  left: { readonly url: URL; readonly digest: string },
  right: { readonly url: URL; readonly digest: string },
): boolean => left.url.href === right.url.href && left.digest === right.digest;

const sameHttpSnapshot = (left: HttpArtifactSnapshot, right: HttpArtifactSnapshot): boolean => {
  if (left.format === "files") {
    return (
      right.format === "files" &&
      left.files.length === right.files.length &&
      left.files.every((file, index) => {
        const other = right.files[index];
        return other !== undefined && file.path === other.path && sameHttpArtifact(file, other);
      })
    );
  }
  return right.format === left.format && sameHttpArtifact(left, right);
};

/** Whether two entries record the same resolved version, commit, tree, or artifact snapshot. */
const sameResolved = (left: LockEntry, right: LockEntry): boolean => {
  if (isRegistryLockEntry(left)) {
    return (
      isRegistryLockEntry(right) &&
      left.resolved.version === right.resolved.version &&
      left.resolved.integrity === right.resolved.integrity &&
      left.resolved.publisherBindingId === right.resolved.publisherBindingId
    );
  }
  if (isGitLockEntry(left)) {
    return (
      isGitLockEntry(right) &&
      left.resolved.commit === right.resolved.commit &&
      left.resolved.tree === right.resolved.tree
    );
  }
  if (isPathLockEntry(left)) {
    return isPathLockEntry(right) && left.resolved.tree === right.resolved.tree;
  }
  return isHttpLockEntry(left) && isHttpLockEntry(right)
    ? sameHttpSnapshot(left.resolved, right.resolved)
    : false;
};

/**
 * Whether two accepted resolutions are one immutable resolution: the same
 * source and package, and the same version, commit, or tree. A range is not
 * part of it; the resolved version or commit always is.
 */
export const sameAcceptedResolution = (left: LockEntry, right: LockEntry): boolean =>
  sameLockSource(left.source, right.source) &&
  left.identity.owner === right.identity.owner &&
  left.identity.name === right.identity.name &&
  left.treeIntegrity === right.treeIntegrity &&
  sameResolved(left, right);

/**
 * The authority a source locator that is neither a workspace nor a Registry
 * locator declares: a local path, or otherwise a git repository, which is
 * every remaining spelling the source grammar resolves.
 */
export const locatorAuthority = (locator: string): "git" | "http" | "path" =>
  Option.match(parseInputPattern(locator), {
    onNone: () => "git",
    onSome: (parsed) =>
      parsed.pattern.pattern === "file-path-pattern"
        ? "path"
        : parsed.pattern.pattern === "url-input" && httpSourceKind(parsed.pattern.url) !== undefined
          ? "http"
          : "git",
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
    case "http":
      return { authority: "http", locator: printSourceParams(ref.source), fqn };
    case "git-hosted":
      return { authority: "git", locator: printSourceParams(ref.source), fqn };
  }
};

/** The MCP package an FQN names, when it names one. */
const mcpPackage = (
  fqn: string | undefined,
): Option.Option<{ readonly owner: string; readonly name: string }> => {
  const parsed = fqn === undefined ? undefined : parseExtensionFqnParts(fqn);
  return parsed?.type === "mcp-server"
    ? Option.some({ owner: parsed.owner, name: parsed.name })
    : Option.none();
};

/**
 * The source identity a desired MCP node is bound to: its Registry endpoint
 * and package, its workspace package, or the accepted row a git or path
 * declaration resolved to. A Registry node with no bound endpoint, and a git
 * or path node not yet accepted, have none; nothing is recovered from display
 * text.
 */
export const desiredMcpSource = (
  identity: DesiredNodeIdentity,
): Option.Option<McpSourceIdentity> => {
  switch (identity.authority) {
    case "registry": {
      const endpoint = identity.registry.endpoint;
      return endpoint === undefined
        ? Option.none()
        : Option.map(mcpPackage(identity.fqn), (pkg) => ({
            kind: "registry" as const,
            endpoint,
            ...pkg,
          }));
    }
    case "workspace":
      return Option.map(mcpPackage(identity.fqn), (pkg) => ({
        kind: "workspace" as const,
        ...pkg,
      }));
    case "git":
    case "path":
      return Option.fromUndefinedOr(identity.acceptedSource);
    case "http":
    case "bundled":
    case "inline":
      return Option.none();
  }
};

/** The key a desired MCP node's closure is recorded under, when its source is bound. */
export const desiredMcpSourceKey = (identity: DesiredNodeIdentity): Option.Option<McpSourceKey> =>
  Option.map(desiredMcpSource(identity), McpSourceKey.encode);

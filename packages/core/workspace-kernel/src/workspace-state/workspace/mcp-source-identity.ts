/**
 * The one codec for MCP source identities and the keys their accepted
 * resolutions are recorded under.
 *
 * Connection names deliberately do not participate: several local MCP
 * connections may share one source identity and therefore one accepted
 * resolution. A key is minted only here, from a structured identity: an
 * accepted row, a bound desired identity, or a selected request. Consumers
 * compare keys with {@link McpSourceKey.equals} or identities structurally,
 * and never build, strip, or parse a key's text.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  sameRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

/** Where one MCP source is acquired from, and the package it names there. */
export type McpSourceIdentity =
  | {
      readonly kind: "registry";
      readonly endpoint: RegistryEndpoint;
      readonly owner: string;
      readonly name: string;
    }
  | {
      readonly kind: "git";
      readonly url: URL;
      readonly owner: string | undefined;
      readonly name: string;
    }
  | {
      readonly kind: "path";
      /** The workspace-relative source path, as the accepted row records it. */
      readonly path: string;
      readonly owner: string | undefined;
      readonly name: string;
    }
  | {
      readonly kind: "workspace";
      readonly owner: string;
      readonly name: string;
    };

const McpSourceKeySchema = Schema.String.pipe(Schema.brand("McpSourceKey"));

/**
 * The opaque key one MCP source closure's accepted resolution is recorded,
 * and removed, under. Distinct from a connection name and from a credential
 * key even where its text derives from the same endpoint.
 */
export type McpSourceKey = typeof McpSourceKeySchema.Type;

const brandKey = Schema.decodeUnknownSync(McpSourceKeySchema);

// Durable key bytes: an authority loses one trailing slash, so a Registry
// origin and a git URL keep the serialization rows were always written with.
const withoutTrailingSlash = (href: string): string =>
  href.endsWith("/") ? href.slice(0, -1) : href;

const packagePart = (owner: string | undefined, name: string): string =>
  `${owner ?? ""}/mcps/${name}`;

const encode = (identity: McpSourceIdentity): McpSourceKey => {
  switch (identity.kind) {
    case "registry":
      return brandKey(
        `registry:${encodeURIComponent(withoutTrailingSlash(identity.endpoint.href))}:${packagePart(identity.owner, identity.name)}`,
      );
    case "git":
      return brandKey(
        `git:${encodeURIComponent(withoutTrailingSlash(identity.url.href))}:${packagePart(identity.owner, identity.name)}`,
      );
    case "path":
      return brandKey(
        `path:${encodeURIComponent(identity.path)}:${packagePart(identity.owner, identity.name)}`,
      );
    case "workspace":
      return brandKey(`workspace:${packagePart(identity.owner, identity.name)}`);
  }
};

/** The source and package an accepted MCP row records. */
export interface McpSourceRow {
  readonly source:
    | { readonly type: "registry"; readonly url: RegistryEndpoint }
    | { readonly type: "git"; readonly url: URL }
    | { readonly type: "path"; readonly path: string };
  readonly identity: { readonly owner?: string | undefined; readonly name: string };
}

/** The source identity an accepted MCP row records. */
const identityOfLockEntry = (entry: McpSourceRow): McpSourceIdentity => {
  switch (entry.source.type) {
    case "registry":
      return {
        kind: "registry",
        endpoint: entry.source.url,
        owner: entry.identity.owner ?? "",
        name: entry.identity.name,
      };
    case "git":
      return {
        kind: "git",
        url: entry.source.url,
        owner: entry.identity.owner,
        name: entry.identity.name,
      };
    case "path":
      return {
        kind: "path",
        path: entry.source.path,
        owner: entry.identity.owner,
        name: entry.identity.name,
      };
  }
};

/** Whether two MCP source identities name one source and package. */
const sameIdentity = (left: McpSourceIdentity, right: McpSourceIdentity): boolean => {
  switch (left.kind) {
    case "registry":
      return (
        right.kind === "registry" &&
        sameRegistryEndpoint(left.endpoint, right.endpoint) &&
        left.owner === right.owner &&
        left.name === right.name
      );
    case "workspace":
      return right.kind === "workspace" && left.owner === right.owner && left.name === right.name;
    case "git":
    case "path":
      return encode(left) === encode(right);
  }
};

/** The MCP source-identity codec. */
export const McpSourceIdentity = {
  fromLockEntry: identityOfLockEntry,
  equals: sameIdentity,
} as const;

/** The MCP source-key codec: every key is minted and compared here. */
export const McpSourceKey = {
  /** The key one structured source identity is recorded under. */
  encode,
  /** The key an accepted MCP row is recorded under. */
  fromLockEntry: (entry: McpSourceRow): McpSourceKey => encode(identityOfLockEntry(entry)),
  equals: (left: McpSourceKey, right: McpSourceKey): boolean => left === right,
} as const;

import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import { desiredMcpSourceKey } from "./desired-identity.js";
import { McpSourceIdentity, McpSourceKey } from "./mcp-source-identity.js";
import { makeRegistryMcpServerLockEntry, TEST_TREE_INTEGRITY } from "./test-stubs.js";

const owner = decodeHandleSync("@acme");

describe("MCP source keys", () => {
  // The durable lock-map bytes every accepted MCP row is recorded under.
  it.each([
    {
      identity: {
        kind: "registry",
        endpoint: decodeRegistryEndpointSync("https://registry.example.com/"),
        owner: "@acme",
        name: "context",
      },
      key: "registry:https%3A%2F%2Fregistry.example.com:@acme/mcps/context",
    },
    {
      identity: {
        kind: "registry",
        endpoint: decodeRegistryEndpointSync("file:///srv/registry/"),
        owner: "@acme",
        name: "context",
      },
      key: "registry:file%3A%2F%2F%2Fsrv%2Fregistry:@acme/mcps/context",
    },
    {
      identity: {
        kind: "git",
        url: new URL("https://github.com/acme/extensions.git"),
        owner: "@acme",
        name: "context",
      },
      key: "git:https%3A%2F%2Fgithub.com%2Facme%2Fextensions.git:@acme/mcps/context",
    },
    {
      identity: {
        kind: "git",
        url: new URL("https://github.com/acme/extensions/"),
        owner: undefined,
        name: "context",
      },
      key: "git:https%3A%2F%2Fgithub.com%2Facme%2Fextensions:/mcps/context",
    },
    {
      identity: { kind: "path", path: "vendor/context", owner: "@acme", name: "context" },
      key: "path:vendor%2Fcontext:@acme/mcps/context",
    },
    {
      identity: { kind: "workspace", owner: "@acme", name: "context" },
      key: "workspace:@acme/mcps/context",
    },
  ] satisfies ReadonlyArray<{ readonly identity: McpSourceIdentity; readonly key: string }>)(
    "keeps the $identity.kind key bytes",
    ({ identity, key }) => {
      expect(McpSourceKey.encode(identity)).toBe(key);
    },
  );

  it("derives one key for an accepted row and the bound declaration it resolves", () => {
    const endpoint = decodeRegistryEndpointSync("https://registry.example.com");
    const row = makeRegistryMcpServerLockEntry({ owner, name: "context", endpoint });
    const fromRow = McpSourceKey.fromLockEntry(row);
    // An explicit Pack-member endpoint and a settings declaration through an
    // alias of the same endpoint name one source.
    for (const sourceName of [undefined, "corp"]) {
      expect(
        desiredMcpSourceKey({
          authority: "registry",
          fqn: "@acme/mcps/context",
          registry: { sourceName, endpoint: decodeRegistryEndpointSync(`${endpoint.href}/`) },
        }),
      ).toEqual(Option.some(fromRow));
    }
  });

  it("mints no key from display text for an unbound or unaccepted source", () => {
    expect(
      desiredMcpSourceKey({
        authority: "registry",
        fqn: "@acme/mcps/context",
        registry: { sourceName: "missing", endpoint: undefined },
      }),
    ).toEqual(Option.none());
    expect(
      desiredMcpSourceKey({
        authority: "git",
        locator: "acme/extensions",
        fqn: "@acme/mcps/context",
      }),
    ).toEqual(Option.none());
    expect(desiredMcpSourceKey({ authority: "inline", name: "context" })).toEqual(Option.none());
  });

  it("keys a git or path declaration by the accepted row it resolved to", () => {
    const row = {
      source: { type: "path", path: "vendor/context" },
      identity: { owner, name: "context" },
      resolved: { tree: TEST_TREE_INTEGRITY },
      treeIntegrity: TEST_TREE_INTEGRITY,
    } as const;
    expect(
      desiredMcpSourceKey({
        authority: "path",
        locator: "./vendor/context",
        fqn: "@acme/mcps/context",
        acceptedSource: McpSourceIdentity.fromLockEntry(row),
      }),
    ).toEqual(Option.some(McpSourceKey.fromLockEntry(row)));
  });
});

import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { type PackManifest } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { PackLockEntry } from "../desired/lockfile/index.js";
import { authorizeExternalPackRoutes } from "./desired-pack-lock.js";
import { UNCONSTRAINED_DESIRED_NODE, type DesiredExtensionNode } from "./desired-state-graph.js";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";

const owner = decodeHandleSync("@acme");
const name = decodeExtensionNameSync("toolkit");
const version = decodeVersionSync("1.0.0");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
);
const manifest = {
  owner,
  type: "pack",
  name,
  version,
  dependencies: {},
} satisfies PackManifest;

const externalPackNode: DesiredExtensionNode = {
  type: "pack",
  name: "toolkit",
  identity: {
    authority: "registry",
    fqn: "@acme/packs/toolkit",
    registry: { sourceName: undefined, endpoint: new URL("https://registry.agentxm.ai") },
  },
  source: "@acme/packs/toolkit",
  enabled: true,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [{ type: "settings", source: "@acme/packs/toolkit", enabled: true }],
};

const accepted = (
  manifestContentIdentity = computePackManifestContentIdentity(manifest),
): PackLockEntry => ({
  source: { type: "registry", url: new URL("https://registry.agentxm.ai") },
  identity: { owner, name },
  resolved: {
    version,
    integrity: "sha512-test",
    publisherBindingId: "hbnd_test",
  },
  manifestVersion: version,
  manifestContentIdentity,
  dependencies: {},
  treeIntegrity,
});

describe("authorizeExternalPackRoutes", () => {
  it("fails closed when an external configured Pack lacks an accepted resolution", () => {
    expect(
      authorizeExternalPackRoutes({
        node: externalPackNode,
        accepted: undefined,
        declarationLocation: "axm-lock.yaml#packs.toolkit",
      }),
    ).toEqual({
      authorized: false,
      problem: expect.objectContaining({ type: "pack-resolution-unavailable" }),
    });
  });

  it("authorizes matching accepted declarations without installed manifest evidence", () => {
    expect(
      authorizeExternalPackRoutes({
        node: externalPackNode,
        accepted: accepted(),
        declarationLocation: "axm-lock.yaml#packs.toolkit",
      }),
    ).toEqual({
      authorized: true,
    });
  });

  it("refuses an accepted declaration for a different Pack", () => {
    expect(
      authorizeExternalPackRoutes({
        node: externalPackNode,
        declarationLocation: "axm-lock.yaml#packs.toolkit",
        accepted: { ...accepted(), identity: { owner, name: decodeExtensionNameSync("other") } },
      }),
    ).toEqual({
      authorized: false,
      problem: expect.objectContaining({ type: "pack-resolution-unavailable" }),
    });
  });

  it("refuses matching package names when configured Registry authority is unknown", () => {
    expect(
      authorizeExternalPackRoutes({
        node: {
          ...externalPackNode,
          identity: {
            authority: "registry",
            fqn: "@acme/packs/toolkit",
            registry: { sourceName: "missing", endpoint: undefined },
          },
        },
        accepted: accepted(),
        declarationLocation: "axm-lock.yaml#packs.toolkit",
      }),
    ).toEqual({
      authorized: false,
      problem: expect.objectContaining({ type: "pack-resolution-unavailable" }),
    });
  });
});

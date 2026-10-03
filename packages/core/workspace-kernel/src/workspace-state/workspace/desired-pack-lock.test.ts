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
import { decodePackManifestDocument } from "./pack-manifests.js";

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
const manifestPath = "/workspace/agent_extensions/registry/@acme/packs/toolkit/pack.json";

const externalPackNode: DesiredExtensionNode = {
  type: "pack",
  name: "toolkit",
  identity: {
    authority: "registry",
    fqn: "@acme/packs/toolkit",
    registry: { sourceName: undefined, endpoint: undefined },
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
  members: [],
  treeIntegrity,
});

/** The observation the evaluator hands the authorization, decoded from document text. */
const observe = (contents: string) => {
  const observation = decodePackManifestDocument(contents);
  if (observation.status !== "decoded") throw new Error(`Expected a decoded manifest: ${contents}`);
  return { manifest: observation.manifest, contentIdentity: observation.contentIdentity };
};

describe("authorizeExternalPackRoutes", () => {
  it("fails closed when an external configured Pack lacks an accepted resolution", () => {
    const authorization = authorizeExternalPackRoutes({
      node: externalPackNode,
      accepted: undefined,
      manifestPath,
      ...observe(JSON.stringify(manifest)),
    });
    expect(authorization).toEqual({
      authorized: false,
      problem: expect.objectContaining({ type: "pack-resolution-unavailable" }),
    });
  });

  it("accepts decoded-equivalent Pack manifest formatting", () => {
    const authorization = authorizeExternalPackRoutes({
      node: externalPackNode,
      accepted: accepted(),
      manifestPath,
      ...observe(
        JSON.stringify(
          { dependencies: {}, version: "1.0.0", name: "toolkit", type: "pack", owner: "@acme" },
          null,
          2,
        ),
      ),
    });
    expect(authorization).toEqual({ authorized: true });
  });

  it("accepts unrecognised Pack manifest fields when semantic identity matches", () => {
    const authorization = authorizeExternalPackRoutes({
      node: externalPackNode,
      accepted: accepted(),
      manifestPath,
      ...observe(JSON.stringify({ ...manifest, extra: 1 })),
    });
    expect(authorization).toEqual({ authorized: true });
  });

  it("rejects a Pack manifest semantic change with the accepted and observed identities", () => {
    const authorization = authorizeExternalPackRoutes({
      node: externalPackNode,
      accepted: accepted(),
      manifestPath,
      ...observe(JSON.stringify({ ...manifest, dependencies: { "@evil/skills/injected": "*" } })),
    });
    expect(authorization).toEqual({
      authorized: false,
      problem: expect.objectContaining({
        type: "pack-manifest-content-mismatch",
        status: "changed",
        path: manifestPath,
        acceptedVersion: version,
        acceptedContentIdentity: computePackManifestContentIdentity(manifest),
        observedVersion: version,
      }),
    });
  });
});

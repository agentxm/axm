/**
 * Accepted external resolutions, seeded directly into the lockfile.
 *
 * Adoption's decisive claim is that taking authorship retires the accepted
 * resolution the package used to carry, and leaves every other one alone.
 * Proving that needs a real lockfile row — but not the install feature that
 * normally writes one, which authoring may not import. The row is written
 * through the same workspace-state writer an install would use, so the shape
 * is the product's, not the test's, and every extension type has one.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
  extensionTypeToPlural,
  type ExtensionName,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  AcceptedResolutionWriter,
  WorkspaceLocation,
  computeMaterializedTreeIntegrity,
  mcpRegistryResolutionKey,
} from "../../desired-state/index.js";

/** The Registry an accepted resolution in these specifications came from. */
export const SPEC_REGISTRY_ENDPOINT = "https://registry.example.com/";

/**
 * The settings `sources` row that names it. A lockfile row references its
 * source by name, so a workspace that holds an accepted resolution must
 * declare the Registry it was accepted from.
 */
export const SPEC_REGISTRY_SOURCE = {
  name: "agentxm",
  type: "registry",
  location: SPEC_REGISTRY_ENDPOINT,
} as const;

const decodeSourceHash = Schema.decodeUnknownSync(SourceHashSchema);

export interface AcceptedRegistryResolution {
  readonly type: ExtensionType;
  /** The owner the package was published under, as typed. */
  readonly owner: string;
  readonly name: string;
  readonly version: string;
}

/**
 * Record an accepted Registry resolution for a package the workspace already
 * holds under its acquired root.
 */
export const seedAcceptedRegistryResolution = Effect.fn("seedAcceptedRegistryResolution")(
  function* (resolution: AcceptedRegistryResolution) {
    const accepted = yield* AcceptedResolutionWriter;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const path = yield* Path.Path;
    const owner = decodeHandleSync(resolution.owner);
    const canonicalPath = path.join(
      layout.acquiredRoot,
      "agentxm",
      owner,
      extensionTypeToPlural[resolution.type],
      resolution.name,
    );
    const treeIntegrity = yield* computeMaterializedTreeIntegrity(canonicalPath);
    const name: ExtensionName = decodeExtensionNameSync(resolution.name);
    const shared = {
      type: "registry",
      sourceType: "registry",
      sourceName: "agentxm",
      endpoint: new URL(SPEC_REGISTRY_ENDPOINT),
      packageFormat: "agentxm",
      owner,
      name,
      workspaceName: name,
      resolvedVersion: decodeVersionSync(resolution.version),
      integrity: `sha512-${resolution.name}`,
      publisherBindingId: "spec-publisher-binding",
      treeIntegrity,
    } as const;

    switch (resolution.type) {
      case "skill":
        return yield* accepted.setAccepted("skill", resolution.name, {
          ...shared,
          extensionType: "skill",
        });
      case "subagent":
        return yield* accepted.setAccepted("subagent", resolution.name, {
          ...shared,
          extensionType: "subagent",
        });
      case "rule":
        return yield* accepted.setAccepted("rule", resolution.name, {
          ...shared,
          extensionType: "rule",
        });
      case "hook":
        return yield* accepted.setAccepted("hook", resolution.name, {
          ...shared,
          extensionType: "hook",
        });
      case "knowledge":
        return yield* accepted.setAccepted("knowledge", resolution.name, {
          ...shared,
          extensionType: "knowledge",
        });
      case "pack":
        // A Pack row is flat rather than nested, and carries the manifest
        // identity the Registry accepted alongside the tree integrity.
        return yield* accepted.setAccepted("pack", resolution.name, {
          ...shared,
          extensionType: "pack",
          manifestVersion: shared.resolvedVersion,
          manifestContentIdentity: decodeSourceHash(`sha256-${resolution.name}-manifest`),
          members: [],
        });
      case "mcp-server":
        return yield* accepted.setAccepted(
          "mcp-server",
          mcpRegistryResolutionKey({
            authority: SPEC_REGISTRY_ENDPOINT,
            owner,
            name: resolution.name,
          }),
          { ...shared, extensionType: "mcp-server" },
        );
    }
  },
);

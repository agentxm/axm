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
import * as Option from "effect/Option";
import * as Path from "effect/Path";
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
  WorkspaceMutations,
  computeMaterializedTreeIntegrity,
  mcpRegistryResolutionKey,
} from "@agentxm/workspace-state";

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
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const owner = decodeHandleSync(resolution.owner);
    const canonicalPath = path.join(
      ws.layout.acquiredRoot,
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

    const versionRange = Option.none<string>();
    switch (resolution.type) {
      case "skill":
        return yield* ws.setSkillLock({
          name: resolution.name,
          lockEntry: { ...shared, extensionType: "skill" },
          versionRange,
        });
      case "subagent":
        return yield* ws.setSubagentLock({
          name: resolution.name,
          lockEntry: { ...shared, extensionType: "subagent" },
          versionRange,
        });
      case "rule":
        return yield* ws.setRuleLock({
          name: resolution.name,
          lockEntry: { ...shared, extensionType: "rule" },
          versionRange,
        });
      case "hook":
        return yield* ws.setHookLock({
          name: resolution.name,
          lockEntry: { ...shared, extensionType: "hook" },
          versionRange,
        });
      case "knowledge":
        return yield* ws.setKnowledgeLock({
          name: resolution.name,
          lockEntry: { ...shared, extensionType: "knowledge" },
          versionRange,
        });
      case "pack":
        // A Pack row is flat rather than nested, and carries the manifest
        // identity the Registry accepted alongside the tree integrity.
        return yield* ws.setPackLock({
          ...shared,
          extensionType: "pack",
          manifestContentIdentity: decodeSourceHash(`sha256-${resolution.name}-manifest`),
          versionRange,
        });
      case "mcp-server":
        return yield* ws.setMcpServerLock({
          name: resolution.name,
          resolutionKey: mcpRegistryResolutionKey({
            authority: SPEC_REGISTRY_ENDPOINT,
            owner,
            name: resolution.name,
          }),
          lockEntry: { ...shared, extensionType: "mcp-server" },
          versionRange,
        });
    }
  },
);

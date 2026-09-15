import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry/schema";
import type { RegistryClient } from "@agentxm/registry-client";

const v = decodeVersionSync;

export const makeExtensionIndex = (
  name: string,
  type: ExtensionType,
  versions: ReadonlyArray<string>,
): ExtensionIndex =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Assertion needed: test stub omits branded fields
  ({
    name,
    owner: "@acme",
    type,
    versions: versions.map((ver) => ({
      version: v(ver),
      published: "2025-01-01T00:00:00.000Z",
      integrity: "sha512-AAAA==",
    })),
  }) as unknown as ExtensionIndex;

export const makeStubRegistryClient = (indices: ReadonlyArray<ExtensionIndex>): RegistryClient =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Assertion needed: test stub omits branded fields
  ({
    getExtensionIndex: ({ name, type }: { name: string; type: string }) => {
      const found = indices.find((i) => i.name === name && i.type === type);
      return Effect.succeed(Option.fromUndefinedOr(found));
    },
    getExtensionsByScope: () => Effect.die("not used"),
    ownerExists: () => Effect.die("not used"),
    getExtensionPackage: () => Effect.die("not used"),
    publishExtension: () => Effect.die("not used"),
    extensionExists: () => Effect.die("not used"),
    discoverPackages: () => Effect.die("not used"),
  }) as unknown as RegistryClient;

import { describe, expect, it } from "@effect/vitest";

import {
  extensionTypes,
  extensionTypeToPlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import { decodeDesiredExtensionIdentity } from "./desired-identity.js";

describe("decodeDesiredExtensionIdentity", () => {
  it("decodes a plain validated FQN as Registry authority", () => {
    expect(decodeDesiredExtensionIdentity("@acme/packs/toolkit")).toEqual({
      authority: "registry",
      owner: "@acme",
      type: "pack",
      name: "toolkit",
      fqn: "@acme/packs/toolkit",
    });
  });

  it("decodes a workspace-qualified validated FQN as workspace authority", () => {
    expect(decodeDesiredExtensionIdentity("workspace:@acme/packs/toolkit")).toEqual({
      authority: "workspace",
      owner: "@acme",
      type: "pack",
      name: "toolkit",
      fqn: "@acme/packs/toolkit",
    });
  });

  it("reuses the existing FQN grammar for every extension type", () => {
    for (const type of extensionTypes) {
      const plural = extensionTypeToPlural[type];
      expect(decodeDesiredExtensionIdentity(`workspace:@acme/${plural}/example`)).toMatchObject({
        authority: "workspace",
        owner: "@acme",
        type,
        name: "example",
      });
    }
  });

  it.each([
    "",
    "@acme/packs",
    "@acme/unknown/example",
    "workspace:@acme/packs",
    "workspace:registry:@acme/packs/example",
    "registry:@acme/packs/example",
    "external:@acme/packs/example",
  ])("rejects malformed or unsupported desired identity %s", (identity) => {
    expect(decodeDesiredExtensionIdentity(identity)).toBeUndefined();
  });
});

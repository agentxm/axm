import { describe, expect, it } from "@effect/vitest";

import { canonicalAxmPackageRoot } from "./package-root.js";

describe("canonicalAxmPackageRoot", () => {
  it("resolves the current package/src canonical layout", () => {
    const contentLocation = "/ws/.axm/extensions/@agentxm/skills/axm/src";

    expect(
      canonicalAxmPackageRoot({
        origin: "canonical-axm",
        pathSegments: contentLocation.split("/"),
        contentLocation,
      }),
    ).toBe("/ws/.axm/extensions/@agentxm/skills/axm");
  });

  it("resolves the legacy src/name canonical layout", () => {
    const contentLocation = "/ws/.axm/extensions/@agentxm/skills/src/axm";

    expect(
      canonicalAxmPackageRoot({
        origin: "canonical-axm",
        pathSegments: contentLocation.split("/"),
        contentLocation,
      }),
    ).toBe("/ws/.axm/extensions/@agentxm/skills");
  });

  it("keeps canonical pack package roots unchanged", () => {
    const contentLocation = "/ws/.axm/extensions/@agentxm/packs/default";

    expect(
      canonicalAxmPackageRoot({
        origin: "canonical-axm",
        pathSegments: contentLocation.split("/"),
        contentLocation,
      }),
    ).toBe("/ws/.axm/extensions/@agentxm/packs/default");
  });
});

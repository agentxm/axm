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

  it("keeps external package roots scoped to the extension name", () => {
    const contentLocation = "/ws/.axm/extensions/external/skills/local-tool";

    expect(
      canonicalAxmPackageRoot({
        origin: "external-axm",
        pathSegments: contentLocation.split("/"),
        contentLocation,
      }),
    ).toBe(contentLocation);
  });
});

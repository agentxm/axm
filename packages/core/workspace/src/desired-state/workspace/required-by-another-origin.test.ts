import { describe, expect, it } from "@effect/vitest";

import {
  isRequiredByAnotherOrigin,
  originsOutsidePacks,
  type DesiredExtensionOrigin,
} from "./desired-state-graph.js";

const packOrigin = (pack: string): DesiredExtensionOrigin => ({
  type: "pack",
  pack,
  manifestPath: `agent_extensions/${pack}/pack.json`,
  source: "@acme/skills/review",
  constraint: "^1.0.0",
  enabled: true,
});

const directOrigin: DesiredExtensionOrigin = {
  type: "settings",
  localName: "review",
  source: "@acme/skills/review",
  enabled: true,
};

describe("isRequiredByAnotherOrigin", () => {
  it("answers no when the excluded Pack is the only origin", () => {
    expect(
      isRequiredByAnotherOrigin({ origins: [packOrigin("@acme/packs/tools")] }, [
        "@acme/packs/tools",
      ]),
    ).toBe(false);
  });

  it("names an authored Pack with or without its workspace prefix", () => {
    const node = { origins: [packOrigin("workspace:@acme/packs/tools")] };

    expect(isRequiredByAnotherOrigin(node, ["@acme/packs/tools"])).toBe(false);
    expect(isRequiredByAnotherOrigin(node, ["workspace:@acme/packs/tools"])).toBe(false);
  });

  it("answers yes for a direct declaration or another Pack", () => {
    expect(
      isRequiredByAnotherOrigin({ origins: [packOrigin("@acme/packs/tools"), directOrigin] }, [
        "@acme/packs/tools",
      ]),
    ).toBe(true);
    expect(
      isRequiredByAnotherOrigin(
        { origins: [packOrigin("@acme/packs/tools"), packOrigin("@acme/packs/extras")] },
        ["@acme/packs/tools"],
      ),
    ).toBe(true);
  });

  it("excludes every named Pack at once", () => {
    const node = { origins: [packOrigin("@acme/packs/tools"), packOrigin("@acme/packs/extras")] };

    expect(isRequiredByAnotherOrigin(node, ["@acme/packs/tools", "@acme/packs/extras"])).toBe(
      false,
    );
  });

  it("keeps the remaining origins for an activation decision", () => {
    const node = {
      origins: [packOrigin("workspace:@acme/packs/tools"), { ...directOrigin, enabled: false }],
    };

    expect(originsOutsidePacks(node, ["@acme/packs/tools"])).toEqual([
      { ...directOrigin, enabled: false },
    ]);
  });
});

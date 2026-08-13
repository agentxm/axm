import { describe, expect, it } from "vitest";
import {
  buildPackDependencyReachability,
  packDependencyReachabilityByMember,
} from "./dependency-reachability.js";

describe("pack dependency reachability", () => {
  it("classifies satisfying, excluded, and missing members deterministically", () => {
    const records = buildPackDependencyReachability({
      packs: [
        {
          packFqn: "@acme/packs/workflow",
          packAuthority: "workspace",
          manifestPath: ".axm/extensions/@acme/packs/workflow/pack.json",
          dependencies: {
            "@acme/skills/missing": "^1.0.0",
            "@acme/skills/excluded": "^0.0.4",
            "@acme/skills/satisfying": "^0.1.0",
          },
        },
      ],
      members: [
        { fqn: "@acme/skills/satisfying", version: "0.1.4", authority: "registry" },
        { fqn: "@acme/skills/excluded", version: "0.0.5", authority: "workspace" },
      ],
    });

    expect(records.map(({ memberFqn, classification }) => ({ memberFqn, classification }))).toEqual(
      [
        { memberFqn: "@acme/skills/excluded", classification: "excluded" },
        { memberFqn: "@acme/skills/missing", classification: "missing" },
        { memberFqn: "@acme/skills/satisfying", classification: "satisfying" },
      ],
    );
    expect(packDependencyReachabilityByMember(records).get("@acme/skills/excluded")).toEqual([
      records[0],
    ]);
  });

  it("leaves invalid ranges to manifest validation", () => {
    expect(
      buildPackDependencyReachability({
        packs: [
          {
            packFqn: "@acme/packs/workflow",
            packAuthority: "registry",
            manifestPath: "pack.json",
            dependencies: { "@acme/skills/review": "not-semver" },
          },
        ],
        members: [{ fqn: "@acme/skills/review", version: "1.0.0", authority: "registry" }],
      }),
    ).toEqual([]);
  });
});

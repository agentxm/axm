import { describe, expect, it } from "vitest";

import type { DesiredConstraintContributor } from "../../desired-state/index.js";
import { heldBackReleaseWarnings } from "./held-back-releases.js";

const settings = (range: string): DesiredConstraintContributor => ({
  source: "settings",
  range,
  location: "axm.json",
  localName: "my-skill",
});

const pack = (dependingPack: string, range: string): DesiredConstraintContributor => ({
  source: "pack",
  dependingPack,
  range,
  location: `agent_extensions/registry/${dependingPack}/pack.json`,
});

describe("heldBackReleaseWarnings", () => {
  it("names each Pack whose range excludes the newest release", () => {
    expect(
      heldBackReleaseWarnings({
        subject: "@acme/skills/my-skill",
        latestVersion: "2.0.0",
        selectedVersion: "1.3.0",
        contributors: [pack("@acme/packs/a", "^1.0.0"), pack("@acme/packs/b", ">=1.0.0")],
      }),
    ).toEqual([
      '@acme/skills/my-skill held at 1.3.0 by pack "@acme/packs/a" (^1.0.0), latest is 2.0.0',
    ]);
  });

  it("reports nothing when the newest release is selected", () => {
    expect(
      heldBackReleaseWarnings({
        subject: "@acme/skills/my-skill",
        latestVersion: "2.0.0",
        selectedVersion: "2.0.0",
        contributors: [pack("@acme/packs/a", "^1.0.0")],
      }),
    ).toEqual([]);
  });

  it("never reports the workspace's own declaration as a hold", () => {
    expect(
      heldBackReleaseWarnings({
        subject: "@acme/skills/my-skill",
        latestVersion: "2.0.0",
        selectedVersion: "1.3.0",
        contributors: [settings("^1.0.0")],
      }),
    ).toEqual([]);
  });
});

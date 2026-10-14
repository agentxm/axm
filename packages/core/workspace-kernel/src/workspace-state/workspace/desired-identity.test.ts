import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Option from "effect/Option";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import {
  formatDesiredIdentity,
  sameAcceptedResolution,
  sameSourceAuthority,
  sameSourceIdentity,
  type DesiredNodeIdentity,
} from "./desired-identity.js";
import { isRegistryLockEntry } from "./lock-entry.js";
import { makeRegistrySkillLockEntry } from "./test-stubs.js";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

const registry = (
  fqn: string,
  endpoint: string | undefined,
  sourceName: string | undefined = undefined,
): DesiredNodeIdentity => ({
  authority: "registry",
  fqn,
  registry: {
    sourceName,
    endpoint: endpoint === undefined ? undefined : decodeRegistryEndpointSync(endpoint),
  },
});

const identities = FastCheck.oneof(
  FastCheck.record({
    fqn: FastCheck.constantFrom("@acme/skills/review", "@other/skills/review"),
    endpoint: FastCheck.constantFrom(
      "https://registry.example",
      "https://registry.example/",
      "https://mirror.example",
      "file:///srv/registry",
      undefined,
    ),
    alias: FastCheck.constantFrom("agentxm", "corp", undefined),
  }).map(({ fqn, endpoint, alias }) => registry(fqn, endpoint, alias)),
  FastCheck.constantFrom<DesiredNodeIdentity>(
    { authority: "workspace", fqn: "@acme/skills/review" },
    { authority: "bundled", fqn: "@agentxm/skills/review" },
    { authority: "git", locator: "acme/extensions", fqn: "@acme/skills/review" },
    { authority: "path", locator: "./vendor/review" },
    { authority: "inline", name: "review" },
  ),
);

describe("structural source identity", () => {
  fastCheckIt.prop({ identity: identities }, { numRuns: 100, seed: 0x41584d })(
    "is reflexive for every bound identity, and an unbound one equals nothing",
    ({ identity }) => {
      expect(sameSourceIdentity(identity, identity)).toBe(
        identity.authority !== "registry" || identity.registry.endpoint !== undefined,
      );
    },
  );

  fastCheckIt.prop({ left: identities, right: identities }, { numRuns: 200, seed: 0x41584d })(
    "is symmetric and never decided by a configured alias",
    ({ left, right }) => {
      expect(sameSourceIdentity(left, right)).toBe(sameSourceIdentity(right, left));
      if (left.authority === "registry" && right.authority === "registry") {
        const leftEndpoint = left.registry.endpoint;
        const rightEndpoint = right.registry.endpoint;
        expect(sameSourceIdentity(left, right)).toBe(
          left.fqn === right.fqn &&
            leftEndpoint !== undefined &&
            rightEndpoint !== undefined &&
            leftEndpoint.transport === rightEndpoint.transport &&
            leftEndpoint.href === rightEndpoint.href,
        );
      }
    },
  );

  it("distinguishes one FQN at two endpoints whose display text is identical", () => {
    const primary = registry("@acme/skills/review", "https://registry.example", "agentxm");
    const mirror = registry("@acme/skills/review", "https://mirror.example", "agentxm");
    expect(formatDesiredIdentity(primary)).toBe(formatDesiredIdentity(mirror));
    expect(sameSourceIdentity(primary, mirror)).toBe(false);
  });

  it("holds two aliases of one endpoint as one source", () => {
    expect(
      sameSourceIdentity(
        registry("@acme/skills/review", "https://registry.example/", "agentxm"),
        registry("@acme/skills/review", "https://registry.example", "corp"),
      ),
    ).toBe(true);
  });

  it.each([
    "https://github.com/acme/packs.git",
    "https://github.com/acme/packs",
    "git@github.com:acme/packs.git",
    "acme/packs",
  ])("holds the authored spelling %s and the printed form as one git source", (authored) => {
    const fqn = "@acme/packs/toolkit";
    const printed: DesiredNodeIdentity = { authority: "git", locator: "github:acme/packs", fqn };
    expect(sameSourceIdentity({ authority: "git", locator: authored, fqn }, printed)).toBe(true);
    expect(sameSourceIdentity(printed, { authority: "git", locator: authored, fqn })).toBe(true);
  });

  it("distinguishes two repositories however each is spelled", () => {
    const fqn = "@acme/packs/toolkit";
    expect(
      sameSourceIdentity(
        { authority: "git", locator: "https://github.com/acme/packs.git", fqn },
        { authority: "git", locator: "github:acme/other", fqn },
      ),
    ).toBe(false);
    expect(
      sameSourceIdentity(
        { authority: "git", locator: "https://github.com/acme/packs.git#main", fqn },
        { authority: "git", locator: "github:acme/packs@next", fqn },
      ),
    ).toBe(false);
  });

  it("never equates a Registry identity whose endpoint is unbound", () => {
    const unbound = registry("@acme/skills/review", undefined, "missing");
    expect(sameSourceIdentity(unbound, unbound)).toBe(false);
    expect(
      sameSourceIdentity(unbound, registry("@acme/skills/review", "https://registry.example")),
    ).toBe(false);
  });
});

describe("structural source authority", () => {
  it("compares Registry endpoints canonically and Git views field by field", () => {
    expect(
      sameSourceAuthority(
        {
          authority: "registry",
          endpoint: decodeRegistryEndpointSync("https://registry.example/"),
        },
        { authority: "registry", endpoint: decodeRegistryEndpointSync("https://registry.example") },
      ),
    ).toBe(true);
    const git = {
      authority: "git",
      url: new URL("https://github.com/acme/toolkit.git"),
      revision: "main",
      root: Option.some("vendor"),
    } as const;
    expect(sameSourceAuthority(git, { ...git, url: new URL(git.url.href) })).toBe(true);
    expect(sameSourceAuthority(git, { ...git, root: Option.none() })).toBe(false);
    expect(sameSourceAuthority(git, { ...git, revision: "next" })).toBe(false);
  });
});

describe("accepted resolution identity", () => {
  const owner = decodeHandleSync("@acme");
  const accepted = makeRegistrySkillLockEntry({
    owner,
    name: "review",
    endpoint: decodeRegistryEndpointSync("https://registry.example"),
  });

  it("is one resolution at the same source, package, and version", () => {
    expect(
      sameAcceptedResolution(
        accepted,
        makeRegistrySkillLockEntry({
          owner,
          name: "review",
          endpoint: decodeRegistryEndpointSync("https://registry.example/"),
        }),
      ),
    ).toBe(true);
  });

  it("compares the resolution field by field, whatever order its keys were written in", () => {
    expect(
      isRegistryLockEntry(accepted) &&
        sameAcceptedResolution(accepted, {
          ...accepted,
          resolved: {
            publisherBindingId: accepted.resolved.publisherBindingId,
            integrity: accepted.resolved.integrity,
            version: accepted.resolved.version,
          },
        }),
    ).toBe(true);
    expect(
      sameAcceptedResolution(
        accepted,
        makeRegistrySkillLockEntry({
          owner,
          name: "review",
          endpoint: decodeRegistryEndpointSync("https://registry.example"),
          integrity: "sha512-BBBB==",
        }),
      ),
    ).toBe(false);
  });

  it("differs at another endpoint or another resolved version", () => {
    expect(
      sameAcceptedResolution(
        accepted,
        makeRegistrySkillLockEntry({
          owner,
          name: "review",
          endpoint: decodeRegistryEndpointSync("https://mirror.example"),
        }),
      ),
    ).toBe(false);
    expect(
      sameAcceptedResolution(
        accepted,
        makeRegistrySkillLockEntry({
          owner,
          name: "review",
          endpoint: decodeRegistryEndpointSync("https://registry.example"),
          resolvedVersion: decodeVersionSync("2.0.0"),
        }),
      ),
    ).toBe(false);
  });
});

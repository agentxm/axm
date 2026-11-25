import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";

import { findPackPublishDivergenceFindings, validatePublishOwners } from "./preflight.js";

const handle = (value: string): Handle => decodeHandleSync(value);
const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);
const exactVersion = (value: string): Version => decodeVersionSync(value);
const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

describe("pack publish resolution divergence", () => {
  const packCandidate = {
    fqn: "@acme/packs/reviewers",
    type: "pack" as const,
    authored: true,
    version: exactVersion("0.1.1"),
    dependencies: { "@acme/skills/review": versionRange("^0.0.4") },
  };
  const reachability = [
    {
      packFqn: "@acme/packs/reviewers",
      packAuthority: "workspace" as const,
      manifestPath: "packs/reviewers/pack.json",
      memberFqn: "@acme/skills/review",
      constraint: "^0.0.4",
      memberVersion: "0.0.5",
      memberAuthority: "workspace" as const,
      classification: "satisfying" as const,
    },
  ];

  it("does not warn when effective versions agree or the pack is not authored here", () => {
    const admittedPack = {
      target: {
        owner: handle("@acme"),
        type: "pack" as const,
        name: extensionName("reviewers"),
        version: exactVersion("0.1.1"),
      },
      status: "admitted" as const,
      findings: [],
      resolutions: [
        {
          dependency: {
            owner: handle("@acme"),
            type: "skill" as const,
            name: extensionName("review"),
            range: versionRange("^0.0.4"),
          },
          effectiveVersion: exactVersion("0.0.5"),
        },
      ],
    };
    expect(
      findPackPublishDivergenceFindings({
        candidates: [packCandidate],
        reachability,
        packs: [admittedPack],
      }).size,
    ).toBe(0);
    expect(
      findPackPublishDivergenceFindings({
        candidates: [{ ...packCandidate, authored: false }],
        reachability,
        packs: [
          {
            ...admittedPack,
            resolutions: [
              {
                dependency: {
                  owner: handle("@acme"),
                  type: "skill",
                  name: extensionName("review"),
                  range: versionRange("^0.0.4"),
                },
                effectiveVersion: exactVersion("0.0.4"),
              },
            ],
          },
        ],
      }).size,
    ).toBe(0);
  });
});

describe("publish owner validation", () => {
  it.effect(
    "validates each unique publish owner and links missing owners to organization creation",
    () =>
      Effect.gen(function* () {
        const checked: Array<string> = [];
        const client = {
          ownerExists: (owner: ReturnType<typeof handle>) => {
            checked.push(owner);
            return Effect.succeed({ exists: owner !== "@missing" });
          },
        };

        const error = yield* Effect.flip(
          validatePublishOwners([handle("@acme"), handle("@acme"), handle("@missing")], client),
        );

        expect(checked.sort()).toEqual(["@acme", "@missing"]);
        expect(error.category).toBe("not_found");
        expect(error.detail).toContain("@missing");
        expect(error.suggestions).toEqual([
          {
            description: "Create the organization in AgentXM before publishing.",
            url: "https://agentxm.ai/orgs/new",
          },
        ]);
      }),
  );
});

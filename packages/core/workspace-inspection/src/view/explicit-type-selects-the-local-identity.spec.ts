import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { makeRegistrySkillLockEntry } from "@agentxm/workspace-state/testing";

import { defaultViewRegistry, resolveViewHandle, ViewExtension } from "./view-extension.js";
import { inspectionRegistryUrl, makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/view/explicit-type-selects-the-local-identity",
  title: "An explicit type selects the local name's configured identity",
  statement:
    "When metadata is requested for an installed extension by local name with an explicit type, AXM shall use the Registry identity the workspace configured for that name and type, in preference to a same-named entry of another type and to any accepted resolution recorded for another owner.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-inspection/src/view/view-extension.ts",
    "packages/supporting/extension-sources/src/resolve-identifier.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Without an explicit type, the current local-name fallback searches only skills and subagents. Whether bare-name lookup should search every non-container type is undecided; this requirement covers the explicit type selector.",
  ],
});

/** A published index for whichever extension the request asked about. */
const publishedIndex = (args: {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
}) => ({
  owner: args.owner,
  type: args.type,
  name: args.name,
  description: "Review guidance",
  publisher_binding_id: "hbnd_view_fixture",
  visibility: "public",
  deprecation: null,
  versions: [
    { version: "1.1.0", published: "2026-02-01T00:00:00.000Z", integrity: "sha512-BBBB==" },
    { version: "1.0.0", published: "2026-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" },
  ],
});

/**
 * Two extensions of different types share the local name `review`; only the
 * requested type's configured identity may answer.
 */
const configuredBothTypes = {
  sources: [{ type: "registry", name: "agentxm", location: inspectionRegistryUrl }],
  skills: { review: "@acme/skills/review" },
  knowledge: { review: "@acme/knowledge/review" },
};

describe("Typed local-name lookup", () => {
  for (const row of [
    { type: "skill", plural: "skills" },
    { type: "knowledge", plural: "knowledge" },
  ] as const)
    it.effect(`${row.type} resolves to the identity configured for that type`, () => {
      const fixture = makeInspectionFixture({
        settings: configuredBothTypes,
        respond: (request) =>
          request.url.includes("/knowledge/")
            ? { body: publishedIndex({ owner: "@acme", type: "knowledge", name: "review" }) }
            : { body: publishedIndex({ owner: "@acme", type: "skill", name: "review" }) },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const targetRegistry = yield* defaultViewRegistry;
            const parts = yield* resolveViewHandle({
              handle: "review",
              type: Option.some(row.type),
            });
            expect(parts).toMatchObject({ owner: "@acme", type: row.type, name: "review" });

            const result = yield* ViewExtension.read({
              handle: "review",
              parts,
              targetRegistry,
              field: Option.none(),
            });
            expect(result.outcome).toBe("document");
            if (result.outcome === "document")
              expect(result.document).toMatchObject({
                handle: `@acme/${row.plural}/review`,
                type: row.type,
                name: "review",
              });
            expect(fixture.requests.map((request) => request.url)).toEqual([
              `${inspectionRegistryUrl}/v1/extensions/%40acme/${row.plural}/review`,
            ]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  it.effect("uses the configured identity despite a receipt recorded for another owner", () => {
    const fixture = makeInspectionFixture({
      settings: {
        sources: [{ type: "registry", name: "agentxm", location: inspectionRegistryUrl }],
        skills: { review: "@acme/skills/review" },
      },
      lockfile: {
        skills: {
          // A receipt recorded under a different local name, for a different
          // owner: it must not answer for the configured `review` identity.
          "stale-review": makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@stale"),
            name: "review",
            publisherBindingId: "hbnd_stale",
            endpoint: new URL(inspectionRegistryUrl),
          }),
        },
      },
      respond: (request) => ({
        body: publishedIndex({
          owner: request.url.includes("/@stale/") ? "@stale" : "@acme",
          type: "skill",
          name: "review",
        }),
      }),
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          expect(fixture.readFile("axm-lock.yaml")).toContain("@stale");
          const targetRegistry = yield* defaultViewRegistry;
          const parts = yield* resolveViewHandle({
            handle: "review",
            type: Option.some("skill"),
          });
          expect(parts).toMatchObject({ owner: "@acme", type: "skill", name: "review" });

          const result = yield* ViewExtension.read({
            handle: "review",
            parts,
            targetRegistry,
            field: Option.none(),
          });
          if (result.outcome === "document")
            expect(result.document).toMatchObject({
              handle: "@acme/skills/review",
              type: "skill",
              name: "review",
            });
          expect(fixture.requests.map((request) => request.url)).toEqual([
            `${inspectionRegistryUrl}/v1/extensions/%40acme/skills/review`,
          ]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

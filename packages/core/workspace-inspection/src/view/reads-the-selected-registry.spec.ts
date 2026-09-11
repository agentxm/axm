import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { resolveViewRegistry, ViewExtension } from "./view-extension.js";
import { inspectionRegistryUrl, makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/view/reads-the-selected-registry",
  title: "View retrieves metadata from the selected Registry",
  statement:
    "When viewing an extension, AXM shall retrieve its metadata from the explicitly named Registry or the configured default Registry when no name is supplied.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/view/handler.test.ts",
    "packages/core/workspace-inspection/src/view/view-extension.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const publishedIndex = {
  owner: "@acme",
  type: "skill",
  name: "review",
  description: "Review guidance",
  publisher_binding_id: "hbnd_read_fixture",
  visibility: "public",
  deprecation: null,
  versions: [
    { version: "1.1.0", published: "2026-02-01T00:00:00.000Z", integrity: "sha512-BBBB==" },
    { version: "1.0.0", published: "2026-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" },
  ],
};

const companyRegistry = "https://company-registry.example.test";
const handle = "@acme/skills/review";

const configuredSources = [
  { name: "company", type: "registry", location: companyRegistry },
  { name: "code", type: "github", url: "https://github.com" },
];

describe("Registry-selected extension view", () => {
  for (const named of [false, true])
    it.effect(named ? "named Registry" : "default Registry", () => {
      const fixture = makeInspectionFixture({
        settings: { sources: configuredSources },
        respond: () => ({ body: publishedIndex }),
      });
      const parts = parseExtensionFqnParts(handle);
      if (parts === undefined) throw new Error("Expected a fully qualified handle");
      return fixture
        .provide(
          Effect.gen(function* () {
            const targetRegistry = yield* resolveViewRegistry(
              named ? Option.some("company") : Option.none(),
            );
            const result = yield* ViewExtension.read({
              handle,
              parts,
              targetRegistry,
              field: Option.none(),
            });
            expect(result.document).toMatchObject({
              handle,
              owner: "@acme",
              type: "skill",
            });
            expect(fixture.requests.map((request) => request.url)).toEqual([
              `${named ? companyRegistry : inspectionRegistryUrl}/v1/extensions/%40acme/skills/review`,
            ]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  for (const registry of ["absent", "code"])
    it.effect(`does not substitute a Registry for unavailable named source ${registry}`, () => {
      const fixture = makeInspectionFixture({
        settings: { sources: configuredSources },
        respond: () => ({ body: publishedIndex }),
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* Effect.result(resolveViewRegistry(Option.some(registry)));
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result) && result.failure._tag === "PublishedMetadataUnavailable")
              expect(result.failure.detail).toContain(registry);
            expect(fixture.requests).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});

import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { resolveViewHandle, resolveViewRegistry, ViewExtension } from "./view-extension.js";
import {
  inspectionRegistryUrl,
  makeInspectionFixture,
  publishedSkillSelection,
  type ObservedRegistryRequest,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/view/reports-missing-targets-and-fields",
  title: "View reports missing metadata without a success result",
  statement:
    "When an extension or requested metadata field is unavailable, AXM shall report the missing target or field without emitting a successful metadata result.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production inspection reads a native temporary workspace; real files, links and whole-tree snapshots establish inventory and read-only behavior.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/view/handler.test.ts",
    "packages/core/workspace-features/src/inspection/view/view-extension.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const handle = "@acme/skills/review";

const publishedIndex = {
  versions: [{ version: "1.1.0", published: "2026-01-01T00:00:00.000Z" }],
};

/**
 * The three ways a metadata read has nothing to report: the extension itself
 * is absent, the requested field is not a field AXM reports, and the field is
 * reportable but this extension carries no value for it.
 */
const conditions = [
  {
    name: "an absent Registry extension yields no document",
    field: Option.none<string>(),
    respond: (request: ObservedRegistryRequest) => {
      if (request.selection === undefined) throw new Error("Expected selection request");
      return {
        body: {
          schemaVersion: 2,
          purpose: "select",
          selectionPolicyVersion: "1",
          observedAt: "2026-11-13T12:00:00Z",
          results: request.selection.items.map(({ key }) => ({ key, outcome: "unavailable" })),
        },
      };
    },
    reason: "not-found",
  },
  {
    name: "an unsupported field name yields no field value",
    field: Option.some("unsupported"),
    respond: (request: ObservedRegistryRequest) => ({
      body: publishedSkillSelection(request, publishedIndex),
    }),
    reason: "unknown-field",
  },
  {
    name: "a reportable field the extension has no value for yields no field value",
    field: Option.some("description"),
    respond: (request: ObservedRegistryRequest) => ({
      body: publishedSkillSelection(request, publishedIndex),
    }),
    reason: "field-unavailable",
  },
] as const;

describe("Unavailable metadata", () => {
  for (const condition of conditions)
    it.effect(condition.name, () => {
      const fixture = makeInspectionFixture({
        settings: {
          sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
        },
        respond: condition.respond,
      });
      const parts = parseExtensionFqnParts(handle);
      if (parts === undefined) throw new Error("Expected a fully qualified handle");
      return fixture
        .provide(
          Effect.gen(function* () {
            const targetRegistry = yield* resolveViewRegistry(Option.none());
            const result = yield* Effect.result(
              ViewExtension.read({ handle, parts, targetRegistry, field: condition.field }),
            );
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result)) {
              expect(result.failure._tag).toBe("PublishedMetadataUnavailable");
              if (result.failure._tag === "PublishedMetadataUnavailable") {
                expect(result.failure.reason).toBe(condition.reason);
                expect(result.failure.detail.length).toBeGreaterThan(0);
              }
            }
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  it.effect("an absent local name is refused before any Registry request", () => {
    const fixture = makeInspectionFixture({
      settings: {},
      respond: () => ({ body: {} }),
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(
            resolveViewHandle({ handle: "absent", type: Option.none() }),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result) && result.failure._tag === "PublishedMetadataUnavailable")
            expect(result.failure.detail).toContain("absent");
          expect(fixture.requests).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

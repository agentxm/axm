import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { defaultViewRegistry, resolveViewHandle, ViewExtension } from "./view-extension.js";
import { makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/view/reports-missing-targets-and-fields",
  title: "View reports missing metadata without a success result",
  statement:
    "When an extension or requested metadata field is unavailable, AXM shall report the missing target or field without emitting a successful metadata result.",
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

const handle = "@acme/skills/review";

/** A published index whose only distinguishing trait is its version list. */
const publishedIndex = (versions: ReadonlyArray<string>) => ({
  owner: "@acme",
  type: "skill",
  name: "review",
  description: "Review guidance",
  publisher_binding_id: "hbnd_read_fixture",
  visibility: "public",
  deprecation: null,
  versions: versions.map((version, index) => ({
    version,
    published: `2026-0${String(index + 1)}-01T00:00:00.000Z`,
    integrity: "sha512-AAAA==",
  })),
});

const notFoundBody = {
  kind: "NotFoundError",
  type: "about:blank",
  title: "Extension not found",
  status: 404,
  code: "extension_not_found",
  detail: "Fixture extension not found",
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
    respond: () => ({ status: 404, body: notFoundBody }),
    reason: "not-found",
  },
  {
    name: "an unsupported field name yields no field value",
    field: Option.some("unsupported"),
    respond: () => ({ body: publishedIndex(["1.1.0"]) }),
    reason: "unknown-field",
  },
  {
    name: "a reportable field the extension has no value for yields no field value",
    field: Option.some("version"),
    respond: () => ({ body: publishedIndex([]) }),
    reason: "field-unavailable",
  },
] as const;

describe("Unavailable metadata", () => {
  for (const condition of conditions)
    it.effect(condition.name, () => {
      const fixture = makeInspectionFixture({ settings: {}, respond: condition.respond });
      const parts = parseExtensionFqnParts(handle);
      if (parts === undefined) throw new Error("Expected a fully qualified handle");
      return fixture
        .provide(
          Effect.gen(function* () {
            const targetRegistry = yield* defaultViewRegistry;
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
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
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
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

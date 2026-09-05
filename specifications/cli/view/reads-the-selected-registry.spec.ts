import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import {
  handleView,
  ViewDocumentSchema,
  expectNoPlanEnvelope,
  getAppError,
} from "axm.sh/specification-harness";
import {
  makeReadSpecWorkspace,
  readRegistry,
  readExtensionIndex,
} from "../../support/read-harness.js";

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
    "packages/cli/src/root/view/handler.internal.test.ts",
    "packages/cli/src/root/view/handler.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Registry-selected extension view", () => {
  for (const named of [false, true])
    it.effect(named ? "named Registry" : "default Registry", () => {
      const selected = named ? "https://company-registry.example.test" : readRegistry;
      const workspace = makeReadSpecWorkspace({
        settings: {
          sources: [
            {
              name: "company",
              type: "registry",
              location: "https://company-registry.example.test",
            },
          ],
        },
      });
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleView({
            handle: "@acme/skills/review",
            field: Option.none(),
            registry: named ? Option.some("company") : Option.none(),
          });
          expectNoPlanEnvelope(workspace.rendererState.results.at(-1)?.data);
          const result = Schema.decodeUnknownSync(Schema.toType(ViewDocumentSchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(result).toMatchObject({
            handle: "@acme/skills/review",
            owner: "@acme",
            type: "skill",
            description: "Review guidance",
            latest: { version: "1.1.0" },
            visibility: "public",
            deprecation: null,
          });
          expect(result.latest && DateTime.formatIso(result.latest.published)).toBe(
            "2026-02-01T00:00:00.000Z",
          );
          expect(workspace.requests.map((request) => request.url)).toEqual([
            `${selected}/v1/extensions/@acme/skills/review`,
          ]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({ body: readExtensionIndex }),
      );
    });

  for (const registry of ["absent", "code"])
    it.effect(`does not substitute a Registry for unavailable named source ${registry}`, () => {
      const workspace = makeReadSpecWorkspace({
        settings: {
          sources: [
            {
              name: "company",
              type: "registry",
              location: "https://company-registry.example.test",
            },
            { name: "code", type: "github", url: "https://github.com" },
          ],
        },
      });
      return workspace.withRegistry(
        Effect.gen(function* () {
          const result = yield* Effect.result(
            handleView({
              handle: "@acme/skills/review",
              field: Option.none(),
              registry: Option.some(registry),
            }),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(getAppError(result.failure).detail).toContain(registry);
          expect(workspace.requests).toEqual([]);
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({ body: readExtensionIndex }),
      );
    });
});

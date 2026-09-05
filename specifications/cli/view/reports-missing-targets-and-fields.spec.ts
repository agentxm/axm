import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import { handleView, getAppError } from "axm.sh/specification-harness";
import { makeSpecRegistry } from "../../support/registry-fixture.js";
import { makeReadSpecWorkspace, readExtensionIndex } from "../../support/read-harness.js";

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
    "packages/cli/src/root/view/handler.internal.test.ts",
    "packages/cli/src/root/view/handler.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unavailable metadata", () => {
  for (const condition of ["extension", "unknown-field", "unavailable-field"] as const)
    it.effect(condition, () => {
      const workspace = makeReadSpecWorkspace();
      return workspace.withRegistry(
        Effect.gen(function* () {
          const result = yield* Effect.result(
            handleView({
              handle: "@acme/skills/review",
              field:
                condition === "extension"
                  ? Option.none()
                  : Option.some(condition === "unknown-field" ? "unsupported" : "version"),
              registry: Option.none(),
            }),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(getAppError(result.failure).code).toBe(
              condition === "unavailable-field" ? "validation" : "not_found",
            );
          if (Result.isFailure(result)) expect(getAppError(result.failure).detail).toBeTruthy();
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () =>
          condition === "extension"
            ? {
                status: 404,
                body: {
                  kind: "NotFoundError",
                  type: "about:blank",
                  title: "Extension not found",
                  status: 404,
                  code: "extension_not_found",
                  detail: "Fixture extension not found",
                },
              }
            : {
                body:
                  condition === "unavailable-field"
                    ? { ...readExtensionIndex, versions: [] }
                    : readExtensionIndex,
              },
      );
    });

  it.effect("reports an absent local name without emitting unrelated Registry metadata", () => {
    const registry = makeSpecRegistry();
    registry.writeSkill("present", [{ version: "1.0.0", body: "Available review guidance." }]);
    const workspace = makeReadSpecWorkspace({ settings: { sources: [registry.source] } });
    return workspace.withRegistry(
      Effect.gen(function* () {
        const result = yield* Effect.result(
          handleView({ handle: "absent", field: Option.none(), registry: Option.none() }),
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(getAppError(result.failure).code).toBe("not_found");
          expect(getAppError(result.failure).detail).toContain("absent");
        }
        expect(workspace.requests).toEqual([]);
        expect(workspace.rendererState.results).toEqual([]);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            workspace.cleanup();
            registry.cleanup();
          }),
        ),
      ),
      () => ({ body: readExtensionIndex }),
    );
  });
});

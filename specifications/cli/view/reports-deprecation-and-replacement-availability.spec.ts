import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { handleView } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace, readExtensionIndex } from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/view/reports-deprecation-and-replacement-availability",
  title: "View reports deprecation and replacement availability",
  statement:
    "When viewing a deprecated extension, AXM shall report its deprecation guidance while identifying an unavailable replacement without inventing a replacement identity.",
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

describe("Extension deprecation details", () => {
  for (const replacement of [
    { status: "available", fqn: "@acme/skills/replacement" },
    { status: "unavailable" },
  ] as const)
    it.effect(replacement.status, () => {
      const workspace = makeReadSpecWorkspace();
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleView({
            handle: "@acme/skills/review",
            field: Option.some("deprecation"),
            registry: Option.none(),
          });
          const result = Schema.decodeUnknownSync(Schema.toType(DeprecationViewSchema))(
            workspace.rendererState.results[0]?.data,
          );
          expect(DateTime.formatIso(result.deprecatedAt)).toBe("2026-03-01T00:00:00.000Z");
          expect(result).toMatchObject({
            message: "Use the replacement when available.",
            replacement,
          });
          if (replacement.status === "unavailable")
            expect(JSON.stringify(workspace.rendererState.results[0]?.data)).not.toContain("fqn");
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({
          body: {
            ...readExtensionIndex,
            deprecation: {
              deprecatedAt: "2026-03-01T00:00:00.000Z",
              message: "Use the replacement when available.",
              replacement,
            },
          },
        }),
      );
    });
});

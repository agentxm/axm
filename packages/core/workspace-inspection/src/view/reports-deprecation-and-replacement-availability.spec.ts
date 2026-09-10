import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { RegistryUrl } from "@agentxm/registry-client";
import { defaultViewRegistry, ViewExtension } from "./view-extension.js";
import { inspectionRegistryUrl, makeRecordedRegistryPort } from "../testing.js";

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

const handle = "@acme/skills/review";

describe("Extension deprecation details", () => {
  for (const replacement of [
    { status: "available", fqn: "@acme/skills/replacement" },
    { status: "unavailable" },
  ] as const)
    it.effect(replacement.status, () => {
      const registry = makeRecordedRegistryPort(() => ({
        body: {
          ...publishedIndex,
          deprecation: {
            deprecatedAt: "2026-03-01T00:00:00.000Z",
            message: "Use the replacement when available.",
            replacement,
          },
        },
      }));
      const parts = parseExtensionFqnParts(handle);
      if (parts === undefined) throw new Error("Expected a fully qualified handle");
      return Effect.gen(function* () {
        const targetRegistry = yield* defaultViewRegistry;
        const result = yield* ViewExtension.read({
          handle,
          parts,
          targetRegistry,
          field: Option.none(),
        });
        const deprecation = result.document.deprecation;
        if (deprecation === null) throw new Error("Expected a deprecated extension");
        expect(DateTime.formatIso(deprecation.deprecatedAt)).toBe("2026-03-01T00:00:00.000Z");
        expect(deprecation).toMatchObject({
          message: "Use the replacement when available.",
          replacement,
        });
        if (replacement.status === "unavailable")
          expect(deprecation.replacement?.fqn).toBeUndefined();
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            registry.layer,
            Layer.merge(NodeServices.layer, Layer.succeed(RegistryUrl, inspectionRegistryUrl)),
          ),
        ),
      );
    });
});

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { RegistryUrl } from "@agentxm/registry-client";

import { ViewExtension } from "./view-extension.js";
import { inspectionRegistryUrl, makeRecordedRegistryPort } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/view/reports-archival-and-effective-lifecycle-state",
  title: "View reports archival and the effective lifecycle state",
  statement:
    "When viewing an archived extension, AXM shall report its archival timestamp and optional reason, retain independent deprecation guidance, and identify archived as the effective lifecycle state in human and machine-readable data.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/view/view.ts",
    "packages/core/workspace/src/inspection/view/view-extension.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Extension archival details", () => {
  it.effect("reports archival alongside deprecation with archival precedence", () => {
    const handle = "@acme/skills/review";
    const parts = parseExtensionFqnParts(handle);
    if (parts === undefined) throw new Error("Expected a fully qualified handle");
    const registry = makeRecordedRegistryPort(() => ({
      body: {
        owner: "@acme",
        type: "skill",
        name: "review",
        publisher_binding_id: "hbnd_read_fixture",
        visibility: "public",
        archival: {
          archivedAt: "2026-09-19T00:00:00.000Z",
          reason: "No longer maintained",
        },
        deprecation: {
          deprecatedAt: "2026-09-18T00:00:00.000Z",
          message: "Move to the replacement.",
        },
        versions: [
          {
            version: "1.0.0",
            published: "2026-01-01T00:00:00.000Z",
            integrity: "sha512-AAAA==",
          },
        ],
      },
    }));

    return Effect.gen(function* () {
      const targetRegistry = { registryName: "agentxm", registryUrl: inspectionRegistryUrl };
      const result = yield* ViewExtension.read({
        handle,
        parts,
        targetRegistry,
        field: Option.none(),
      });

      expect(result.document.lifecycleState).toBe("archived");
      const archival = result.document.archival;
      if (archival === null) throw new Error("Expected archival state");
      expect(archival.reason).toBe("No longer maintained");
      expect(DateTime.formatIso(archival.archivedAt)).toBe("2026-09-19T00:00:00.000Z");
      expect(result.document.deprecation?.message).toBe("Move to the replacement.");
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

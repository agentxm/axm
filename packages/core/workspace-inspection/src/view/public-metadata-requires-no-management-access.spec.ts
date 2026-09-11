import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { RegistryUrl } from "@agentxm/registry-client";
import { defaultViewRegistry, ViewExtension } from "./view-extension.js";
import { inspectionRegistryUrl, makeRecordedRegistryPort } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/view/public-metadata-requires-no-management-access",
  title: "Public metadata can be viewed without management access",
  statement:
    "When viewing public extension metadata through the default Registry, AXM shall complete the read without a workspace, credentials, or a protected visibility-management request.",
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

describe("Anonymous public view", () => {
  it.effect("reads a public index without a workspace service", () => {
    const registry = makeRecordedRegistryPort(() => ({ body: publishedIndex }));
    const handle = "@acme/skills/review";
    const parts = parseExtensionFqnParts(handle);
    if (parts === undefined) throw new Error("Expected a fully qualified handle");
    return Effect.gen(function* () {
      // No workspace layer is provided: the pre-setup path is a request input.
      const targetRegistry = yield* defaultViewRegistry;
      const result = yield* ViewExtension.read({
        handle,
        parts,
        targetRegistry,
        field: Option.none(),
      });
      expect(result.outcome).toBe("document");
      expect(result.document).toMatchObject({ handle, visibility: "public" });
      expect(registry.requests).toHaveLength(1);
      expect(registry.requests[0]).toMatchObject({
        method: "GET",
        url: `${inspectionRegistryUrl}/v1/extensions/%40acme/skills/review`,
        hasAuthorization: false,
      });
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

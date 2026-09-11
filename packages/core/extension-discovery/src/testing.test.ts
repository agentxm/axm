import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { DiscoverExtensions } from "./discover-extensions.js";
import { DiscoveryRegistryTest, makeDiscoveryProject } from "./testing.js";

describe("@agentxm/extension-discovery/testing", () => {
  it.effect("discovers a project's declared extension over the recorded Registry", () => {
    const project = makeDiscoveryProject();
    project.writeJson("package.json", {
      name: "acme-app",
      version: "1.0.0",
      dependencies: { "@acme/review": "1.0.0" },
    });
    const before = project.snapshot();
    const registry = DiscoveryRegistryTest(() => ({
      body: {
        results: [
          {
            purl: "pkg:npm/%40acme/review",
            version: "1.0.0",
            status: "resolved",
            extensions: [
              {
                ref: "@acme/skills/review",
                resolved: true,
                extension: {
                  owner: "@acme",
                  type: "skill",
                  name: "review",
                  installVersion: "1.0.0",
                },
                attestedBy: ["package"],
                official: false,
                packageVersionInRange: true,
              },
            ],
          },
        ],
      },
    }));
    return Effect.gen(function* () {
      const result = yield* DiscoverExtensions.query({ projectDir: project.root });
      expect(result.registryAvailable).toBe(true);
      expect(result.document.items.map((entry) => entry.package)).toEqual([
        "pkg:npm/%40acme/review@1.0.0",
      ]);
      expect(result.document.items[0]?.extensions.map((entry) => entry.ref)).toEqual([
        "@acme/skills/review",
      ]);
      // The Registry was consulted once, and a read-only query left the
      // project exactly as it found it.
      expect(registry.requests.map((request) => request.method)).toEqual(["POST"]);
      expect(project.snapshot()).toEqual(before);
    }).pipe(
      Effect.provide(registry.layer.pipe(Layer.provideMerge(NodeServices.layer))),
      Effect.ensuring(Effect.sync(project.cleanup)),
    );
  });
});

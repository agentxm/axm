import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { discover } from "../discover.js";
import { makeRecordedRegistryPort, makeTemporaryProject } from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/discover/identifies-local-only-recommendations",
  title: "Discover identifies local recommendations when Registry lookup fails",
  statement:
    "When the Registry cannot supply companion recommendations, AXM shall retain valid package-declared recommendations and explicitly report that Registry results are unavailable.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/discover/handler.test.ts",
    "packages/core/extension-discovery/src/discover.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "How should local-only recommendations represent unresolved Registry identity and install version? The current fallback supplies resolved true and a synthetic 0.0.0 version; this requirement does not accept those values as verified Registry facts.",
  ],
});

describe("Local-only discovery", () => {
  it.effect("preserves package declarations while the Registry stays unavailable", () => {
    const project = makeTemporaryProject();
    project.writeJson("package.json", { dependencies: { react: "18.2.0" } });
    project.writeJson("node_modules/react/package.json", {
      name: "react",
      version: "18.2.0",
      axm: { extensions: [{ ref: "@acme/skills/react-review" }] },
    });
    const registry = makeRecordedRegistryPort(() => ({
      status: 503,
      body: {
        kind: "ServiceUnavailableError",
        type: "about:blank",
        title: "Service unavailable",
        status: 503,
        code: "service_unavailable",
        detail: "Fixture Registry unavailable",
      },
    }));
    return Effect.gen(function* () {
      const client = yield* registry.client;
      const running = yield* discover(project.root, client).pipe(Effect.forkChild);
      yield* registry.firstRequest;
      yield* TestClock.adjust("31 seconds");
      const result = yield* Fiber.join(running);
      expect(result).toMatchObject({
        registryAvailable: false,
        totalDetected: 1,
        packages: [
          {
            detectedPackage: { name: "react", version: "18.2.0" },
            extensions: [
              { ref: "@acme/skills/react-review", attestedBy: ["package"], official: false },
            ],
          },
        ],
      });
      expect(registry.requests.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(project.cleanup)));
  });
});

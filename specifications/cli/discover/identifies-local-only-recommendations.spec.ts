import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { handleDiscover } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../../support/read-harness.js";

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
    "packages/cli/src/root/discover/handler.internal.test.ts",
    "packages/extension-discovery/src/discover.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "How should local-only recommendations represent unresolved Registry identity and install version? The current fallback supplies resolved true and a synthetic 0.0.0 version; this requirement does not accept those values as verified Registry facts.",
  ],
});

describe("Local-only discovery", () => {
  it.effect("preserves package declarations while the Registry stays unavailable", () => {
    const workspace = makeReadSpecWorkspace();
    workspace.writeJson("package.json", { dependencies: { react: "18.2.0" } });
    workspace.writeJson("node_modules/react/package.json", {
      name: "react",
      version: "18.2.0",
      axm: { extensions: [{ ref: "@acme/skills/react-review" }] },
    });
    return workspace.withRegistry(
      Effect.gen(function* () {
        const running = yield* handleDiscover({ path: Option.none() }).pipe(Effect.forkChild);
        yield* workspace.waitForRegistryRequest;
        yield* TestClock.adjust("31 seconds");
        yield* Fiber.join(running);
        expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
          registryAvailable: false,
          totalDetected: 1,
          count: 1,
          items: [
            {
              package: "pkg:npm/react@18.2.0",
              extensions: [
                { ref: "@acme/skills/react-review", attestedBy: ["package"], official: false },
              ],
            },
          ],
        });
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      () => ({
        status: 503,
        body: {
          kind: "ServiceUnavailableError",
          type: "about:blank",
          title: "Service unavailable",
          status: 503,
          code: "service_unavailable",
          detail: "Fixture Registry unavailable",
        },
      }),
    );
  });
});

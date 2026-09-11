/**
 * Built-CLI evidence for `cli/environment-selects-registry-services`.
 *
 * The specification lives in
 * `apps/cli/src/environment-selects-registry-services.spec.ts`, beside the
 * composition root that decodes the environment. These rows keep its process
 * controls: a real invocation reading from a real HTTP origin, and the
 * refusal of conflicting selectors before either Registry is contacted.
 */

import { describe, expect, it } from "@effect/vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";
import { readExtensionIndex } from "./test-support/read-extension-index.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/environment-selects-registry-services"],
  boundary: "process",
  rationale:
    "Only a real invocation against a real HTTP origin shows the selected service reaching the wire, and shows a conflicting selector refused before any request leaves the process.",
});

describe("Registry service origin over the built CLI", () => {
  it("the registered view command reads from the explicit service origin", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      await withEnvironmentRegistry(
        () => ({
          body: JSON.stringify({
            ...readExtensionIndex,
            description: "Selected environment service",
          }),
        }),
        async (origin, requests) => {
          const result = await fixture.run(["view", "@acme/skills/review", "--json"], {
            AXM_REGISTRY_URL: origin,
          });
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const document: unknown = JSON.parse(result.stdout);
          expect(document).toMatchObject({
            result: { description: "Selected environment service" },
          });
          expect(requests).toEqual(["/v1/extensions/%40acme/skills/review"]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects conflicting HTTP selectors before contacting either Registry", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      await withEnvironmentRegistry(
        () => ({ body: JSON.stringify(readExtensionIndex) }),
        async (origin, requests) => {
          const result = await fixture.run(["view", "@acme/skills/review", "--json"], {
            AXM_REGISTRY_LOCATION: origin,
            AXM_REGISTRY_URL: "https://different.example.test/private",
          });
          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain("AXM_REGISTRY_LOCATION");
          expect(result.stderr).toContain("AXM_REGISTRY_URL");
          expect(result.stderr).not.toContain("/private");
          expect(requests).toEqual([]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });
});

/** Built-CLI evidence for `cli/settings-select-default-registry`. */

import { describe, expect, it } from "@effect/vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";
import { readExtensionIndex } from "./test-support/read-extension-index.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/settings-select-default-registry"],
  boundary: "process",
  rationale:
    "Only a real invocation against a controlled HTTP origin shows the settings-selected default Registry reaching the wire and an invalid selection being refused before any request leaves the process.",
});

describe("Settings-selected default Registry over the built CLI", () => {
  it("the view command reads from the configured default Registry", async () => {
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
          fixture.writeProjectSettings({
            defaultRegistry: "company",
            sources: [{ name: "company", type: "registry", location: origin }],
          });
          const result = await fixture.run(["view", "@acme/skills/review", "--json"]);
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

  it("rejects an unconfigured default before contacting a Registry", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      await withEnvironmentRegistry(
        () => ({ body: JSON.stringify(readExtensionIndex) }),
        async (_origin, requests) => {
          fixture.writeProjectSettings({
            defaultRegistry: "missing",
            sources: [],
          });
          const result = await fixture.run(["view", "@acme/skills/review", "--json"]);
          expect(result.exitCode).not.toBe(0);
          const document: unknown = JSON.parse(result.stdout);
          expect(document).toMatchObject({
            ok: false,
            detail: 'Default registry source "missing" is not configured.',
          });
          expect(requests).toEqual([]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });
});

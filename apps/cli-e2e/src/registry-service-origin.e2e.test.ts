/** Built-CLI evidence for `cli/settings-select-default-registry`. */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";
import { readExtensionIndex } from "./test-support/read-extension-index.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "cli/settings-select-default-registry",
    "registry/operations-require-supported-transport",
  ],
  boundary: "process",
  rationale:
    "Only a real invocation against a controlled HTTP origin shows the settings-selected default Registry reaching the wire, an invalid selection being refused before any credential is read or request leaves the process, and a file Registry refusing lifecycle and authentication commands.",
});

/** A GitHub Actions identity whose ID-token endpoint is the fixture origin. */
const githubActionsAt = (origin: string) => ({
  ACTIONS_ID_TOKEN_REQUEST_URL: `${origin}/github-id-token?api-version=2.0`,
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-request-token",
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
            problem: { code: "registry-source-unknown", name: "missing", scope: "project" },
          });
          expect(requests).toEqual([]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });

  for (const settings of [
    { label: "an unconfigured default", value: { defaultRegistry: "missing", sources: [] } },
    {
      label: "a path-hosted Registry location",
      value: (origin: string) => ({
        defaultRegistry: "company",
        sources: [{ name: "company", type: "registry", location: `${origin}/axm` }],
      }),
    },
  ])
    for (const command of [
      ["login", "--device-code", "--json", "--non-interactive"],
      ["whoami", "--json"],
      ["token", "list", "--json"],
    ])
      it(`${command[0] ?? ""} with ${settings.label} reads no credential and sends nothing`, async () => {
        const fixture = makeEnvironmentProcessFixture();
        try {
          await withEnvironmentRegistry(
            () => ({ body: JSON.stringify({ value: "fixture-id-token" }) }),
            async (origin, requests) => {
              fixture.writeProjectSettings(
                typeof settings.value === "function" ? settings.value(origin) : settings.value,
              );
              const result = await fixture.run(command, {
                AXM_TOKEN_FILE: `${fixture.root}/missing-token-file`,
                ...githubActionsAt(origin),
              });
              expect(result.exitCode, result.stdout + result.stderr).not.toBe(0);
              // A token file that cannot be read would have been reported; the
              // selection failed before any credential source was consulted.
              expect(result.stdout + result.stderr).not.toContain("AXM_TOKEN_FILE");
              expect(requests).toEqual([]);
            },
          );
        } finally {
          fixture.cleanup();
        }
      });

  it("leaves commands that need no Registry working when its selection is invalid", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      fixture.writeProjectSettings({ defaultRegistry: "missing", sources: [] });
      for (const command of [["--version"], ["help"], ["cache", "status", "--json"]]) {
        const result = await fixture.run(command);
        expect(result.exitCode, `${command.join(" ")}: ${result.stdout}${result.stderr}`).toBe(0);
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("refuses authentication and lifecycle management for a file Registry", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      const registry = path.join(fixture.root, "registry");
      fs.mkdirSync(registry);
      const location = pathToFileURL(registry).href;
      fixture.writeProjectSettings({
        defaultRegistry: "fixture",
        sources: [{ name: "fixture", type: "registry", location }],
      });
      for (const command of [
        ["login", "--device-code", "--json", "--non-interactive"],
        ["logout", "--json"],
        ["whoami", "--json"],
        ["token", "list", "--json"],
        ["deprecate", "@test/skills/review", "--reason", "unmaintained", "--json"],
        ["yank", "@test/skills/review@1.0.0", "--json"],
        ["archive", "@test/skills/review", "--json"],
      ]) {
        const result = await fixture.run(command, {
          AXM_TOKEN_FILE: `${fixture.root}/missing-token-file`,
        });
        expect(result.exitCode, `${command.join(" ")}: ${result.stdout}${result.stderr}`).not.toBe(
          0,
        );
        const document: unknown = JSON.parse(result.stdout);
        expect(document, command.join(" ")).toMatchObject({
          ok: false,
          problem: {
            code: "registry-operation-unsupported",
            endpoint: location,
            transport: "file",
          },
        });
      }
      expect(fs.readdirSync(registry)).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });
});

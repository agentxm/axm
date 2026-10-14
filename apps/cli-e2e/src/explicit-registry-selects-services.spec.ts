import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/registry-input-selects-services",
  title: "An explicit Registry selects transport and credential binding together",
  statement:
    "Published lifecycle, visibility, and view commands shall resolve --registry as a configured source name or absolute http(s) origin before composing Registry transport and credentials. An explicit selection shall override the settings default without sending requests to the unselected Registry, and shall present an ambient credential only when it names the settings-selected default Registry.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "Two real loopback servers distinguish selected and default origins under the built CLI; each server records the bearer header it receives.",
  methods: ["decision-table"],
  derivedFrom: [
    "cli/settings-select-default-registry",
    "cli/publication-uses-explicit-registry-target",
    "cli/credentials-stay-with-their-registry",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The selected server refuses lookup with not_found. These examples establish target and credential composition before a possible write; transition effects are exercised by their owning specifications.",
      retirementCondition:
        "Retain composition checks alongside the owning acknowledged-transition evidence.",
    },
  ],
});

const fqn = "@test/skills/review";
const deprecate = ["deprecate", fqn, "--reason", "unmaintained"];
const view = ["view", fqn];
const commands = [
  ["archive", fqn],
  ["unarchive", fqn],
  deprecate,
  ["undeprecate", fqn],
  ["yank", fqn + "@1.0.0"],
  ["unyank", fqn + "@1.0.0"],
  ["visibility", "status", fqn],
  ["visibility", "set", fqn, "public"],
  ["visibility", "reconcile", fqn],
  view,
];
const missing = {
  status: 404,
  body: JSON.stringify({
    type: "https://registry.example.test/problems/not_found",
    title: "Not Found",
    status: 404,
    code: "not_found",
    detail: "Fixture lookup refused",
  }),
};

/** A workspace whose default Registry is `default` and that also configures `selected`. */
const writeWorkspace = (
  fixture: ReturnType<typeof makeEnvironmentProcessFixture>,
  defaultOrigin: string,
  selectedOrigin: string,
) => {
  fixture.writeProjectSettings({
    owner: "@test",
    agents: [],
    skills: { review: "workspace" },
    sources: [
      { name: "default", type: "registry", location: defaultOrigin },
      { name: "selected", type: "registry", location: selectedOrigin },
    ],
    defaultRegistry: "default",
  });
  const source = path.join(fixture.invoking, "skills", "review");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(
    path.join(source, "skill.json"),
    JSON.stringify({
      owner: "@test",
      type: "skill",
      name: "review",
      version: "1.0.0",
      publish: { visibility: "public" },
    }),
  );
};

describe("Explicit Registry service composition", () => {
  for (const command of commands)
    for (const form of ["name", "url"]) {
      it(`${command.join(" ")} selects the ${form} before credentials and transport`, async () => {
        const fixture = makeEnvironmentProcessFixture();
        const authorization: Array<string | undefined> = [];
        // Only the CLI under test identifies itself as axm-cli; an ephemeral
        // port can also receive unrelated traffic from the host.
        const defaultRequests: Array<string> = [];
        try {
          await withEnvironmentRegistry(
            (requestPath, request) => {
              if (request.headers["user-agent"]?.startsWith("axm-cli/"))
                defaultRequests.push(requestPath);
              return missing;
            },
            async (defaultOrigin) =>
              withEnvironmentRegistry(
                (_requestPath, request) => {
                  authorization.push(request.headers.authorization);
                  return missing;
                },
                async (selectedOrigin, selectedRequests) => {
                  writeWorkspace(fixture, defaultOrigin, selectedOrigin);
                  const result = await fixture.run(
                    [
                      ...command,
                      "--registry",
                      form === "name" ? "selected" : selectedOrigin,
                      "--json",
                      "--non-interactive",
                    ],
                    { AXM_TOKEN: "default-registry-token" },
                  );
                  expect(result.exitCode, result.stdout + result.stderr).not.toBe(0);
                  expect(selectedRequests.length, result.stdout + result.stderr).toBeGreaterThan(0);
                  expect(defaultRequests).toEqual([]);
                  // The ambient token belongs to the default Registry; the
                  // selected one, with no saved session, is read anonymously.
                  expect(authorization.every((header) => header === undefined)).toBe(true);
                },
              ),
          );
        } finally {
          fixture.cleanup();
        }
      });
    }

  for (const command of [deprecate, view])
    for (const form of ["name", "url"]) {
      it(`${command.join(" ")} presents the ambient token when the ${form} names the default`, async () => {
        const fixture = makeEnvironmentProcessFixture();
        const authorization: Array<string | undefined> = [];
        try {
          await withEnvironmentRegistry(
            (_requestPath, request) => {
              authorization.push(request.headers.authorization);
              return missing;
            },
            async (defaultOrigin, defaultRequests) =>
              withEnvironmentRegistry(
                () => missing,
                async (selectedOrigin, selectedRequests) => {
                  writeWorkspace(fixture, defaultOrigin, selectedOrigin);
                  const result = await fixture.run(
                    [
                      ...command,
                      "--registry",
                      // An equivalent spelling of the default's origin is still the default.
                      form === "name" ? "default" : `${defaultOrigin}/`,
                      "--json",
                      "--non-interactive",
                    ],
                    { AXM_TOKEN: "default-registry-token" },
                  );
                  expect(result.exitCode, result.stdout + result.stderr).not.toBe(0);
                  expect(defaultRequests.length, result.stdout + result.stderr).toBeGreaterThan(0);
                  expect(selectedRequests).toEqual([]);
                  expect(
                    authorization.every((header) => header === "Bearer default-registry-token"),
                  ).toBe(true);
                },
              ),
          );
        } finally {
          fixture.cleanup();
        }
      });
    }
});

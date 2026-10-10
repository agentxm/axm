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
    "Published lifecycle, visibility, and view commands shall resolve --registry as a configured source name or absolute HTTP(S) URL before composing Registry transport and credentials. An explicit selection shall override the settings default without sending its credential or requests to the unselected Registry.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "Two real loopback servers distinguish selected and default origins under the built CLI; the selected server records the bearer header.",
  methods: ["decision-table"],
  derivedFrom: [
    "cli/settings-select-default-registry",
    "cli/publication-uses-explicit-registry-target",
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
const commands = [
  ["archive", fqn],
  ["unarchive", fqn],
  ["deprecate", fqn, "--reason", "unmaintained"],
  ["undeprecate", fqn],
  ["yank", fqn + "@1.0.0"],
  ["unyank", fqn + "@1.0.0"],
  ["visibility", "status", fqn],
  ["visibility", "set", fqn, "public"],
  ["visibility", "reconcile", fqn],
  ["view", fqn],
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

describe("Explicit Registry service composition", () => {
  for (const command of commands)
    for (const form of ["name", "url"]) {
      it(`${command.join(" ")} selects the ${form} before credentials and transport`, async () => {
        const fixture = makeEnvironmentProcessFixture();
        const authorization: Array<string | undefined> = [];
        try {
          await withEnvironmentRegistry(
            () => missing,
            async (defaultOrigin, defaultRequests) =>
              withEnvironmentRegistry(
                (_requestPath, request) => {
                  authorization.push(request.headers.authorization);
                  return missing;
                },
                async (selectedOrigin, selectedRequests) => {
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
                  const result = await fixture.run(
                    [
                      ...command,
                      "--registry",
                      form === "name" ? "selected" : selectedOrigin,
                      "--json",
                      "--non-interactive",
                    ],
                    { AXM_TOKEN: "selected-origin-token" },
                  );
                  expect(result.exitCode, result.stdout + result.stderr).not.toBe(0);
                  expect(selectedRequests.length, result.stdout + result.stderr).toBeGreaterThan(0);
                  expect(defaultRequests).toEqual([]);
                  expect(
                    authorization.every((header) => header === "Bearer selected-origin-token"),
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

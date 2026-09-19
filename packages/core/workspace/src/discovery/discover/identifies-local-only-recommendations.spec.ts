import * as NodeServices from "@effect/platform-node/NodeServices";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { discover } from "../discover.js";
import {
  makeRecordedRegistryPort,
  makeTemporaryProject,
  registryFactoryForClient,
  snapshotDirectory,
} from "../test-helpers.js";

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
    "packages/core/workspace/src/discovery/discover.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Local-only discovery", () => {
  it.effect("preserves package declarations while the Registry stays unavailable", () => {
    const project = makeTemporaryProject();
    project.writeJson("package.json", { dependencies: { react: "18.2.0" } });
    project.writeJson("node_modules/react/package.json", {
      name: "react",
      version: "18.2.0",
      agentExtensions: [{ ref: "@acme/skills/react-review" }],
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
      const locations: Array<string> = [];
      const running = yield* discover(
        project.root,
        registryFactoryForClient(client, (location) => locations.push(location)),
      ).pipe(Effect.forkChild);
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
              {
                ref: "@acme/skills/react-review",
                source: { type: "registry", url: new URL("https://registry.agentxm.ai") },
                resolved: false,
                extension: undefined,
                attestedBy: ["package"],
                official: false,
              },
            ],
          },
        ],
      });
      expect(locations).toEqual(["https://registry.agentxm.ai/"]);
      expect(registry.requests.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(project.cleanup)));
  });

  it.effect("resolves Git and workspace-relative path recommendations without a Registry", () => {
    const project = makeTemporaryProject();
    const gitRoot = fs.realpathSync(
      fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-recommendation-")),
    );
    fs.writeFileSync(
      nodePath.join(gitRoot, "skill.json"),
      `${JSON.stringify({
        owner: "@acme",
        type: "skill",
        name: "git-review",
        version: "2.3.4",
      })}\n`,
    );
    execFileSync("git", ["init", "--quiet"], { cwd: gitRoot });
    execFileSync("git", ["add", "skill.json"], { cwd: gitRoot });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=AXM Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ],
      { cwd: gitRoot },
    );
    project.writeJson("extensions/path-review/skill.json", {
      owner: "@acme",
      type: "skill",
      name: "path-review",
      version: "1.4.0",
    });
    project.writeJson("package.json", { dependencies: { react: "18.2.0" } });
    project.writeJson("node_modules/react/package.json", {
      name: "react",
      version: "18.2.0",
      agentExtensions: [
        {
          ref: "@acme/skills/git-review",
          source: { type: "git", url: pathToFileURL(gitRoot).href },
        },
        {
          ref: "@acme/skills/path-review",
          source: { type: "path", path: "extensions/path-review" },
        },
      ],
    });
    const before = snapshotDirectory(project.root);
    const registry = makeRecordedRegistryPort(() => ({ body: { results: [] } }));
    return Effect.gen(function* () {
      const client = yield* registry.client;
      const result = yield* discover(project.root, registryFactoryForClient(client));
      expect(result).toMatchObject({
        registryAvailable: true,
        packages: [
          {
            extensions: [
              {
                ref: "@acme/skills/git-review",
                source: { type: "git", url: new URL(pathToFileURL(gitRoot).href) },
                resolved: true,
                extension: { installVersion: "2.3.4" },
              },
              {
                ref: "@acme/skills/path-review",
                source: { type: "path", path: "extensions/path-review" },
                resolved: true,
                extension: { installVersion: "1.4.0" },
              },
            ],
          },
        ],
      });
      expect(registry.requests).toEqual([]);
      expect(snapshotDirectory(project.root)).toEqual(before);
    }).pipe(
      Effect.provide(NodeServices.layer),
      Effect.ensuring(
        Effect.sync(() => {
          project.cleanup();
          fs.rmSync(gitRoot, { recursive: true, force: true });
        }),
      ),
    );
  });
});

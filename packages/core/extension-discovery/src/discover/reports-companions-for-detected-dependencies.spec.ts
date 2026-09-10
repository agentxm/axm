import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as nodePath from "node:path";
import { defineSpecification } from "@agentxm/specification-metadata";

import { discover } from "../discover.js";
import {
  makeRecordedRegistryPort,
  makeTemporaryProject,
  snapshotDirectory,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/discover/reports-companions-for-detected-dependencies",
  title: "Discover reports companions for actual project dependencies",
  statement:
    "When discovering companion extensions, AXM shall report Registry recommendations only for dependencies detected in the selected project, including their observed package versions and the Registry-provided attestation information.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/discover/handler.test.ts",
    "packages/core/extension-discovery/src/discover.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const companion = {
  ref: "@acme/skills/react-review",
  resolved: true,
  extension: { owner: "@acme", type: "skill", name: "react-review", installVersion: "1.2.3" },
  attestedBy: ["package", "extension"],
  official: true,
  packageVersionInRange: true,
};

describe("Dependency-backed companion discovery", () => {
  it.effect("runs actual manifest detection and filters an unrelated Registry response", () => {
    const project = makeTemporaryProject();
    project.writeJson("package.json", {
      dependencies: { react: "18.2.0" },
      devDependencies: { vite: "5.0.0" },
    });
    project.writeJson("node_modules/react/package.json", {
      name: "react",
      version: "18.2.0",
      axm: { extensions: [{ ref: "@acme/skills/react-review" }] },
    });
    const before = snapshotDirectory(project.root);
    const registry = makeRecordedRegistryPort(() => ({
      body: {
        results: [
          { purl: "pkg:npm/react", version: "18.2.0", status: "resolved", extensions: [companion] },
          {
            purl: "pkg:npm/unrelated",
            version: "1.0.0",
            status: "resolved",
            extensions: [companion],
          },
        ],
      },
    }));
    return Effect.gen(function* () {
      const client = yield* registry.client;
      const result = yield* discover(project.root, client);
      expect(result).toMatchObject({
        totalDetected: 2,
        registryAvailable: true,
        packages: [
          {
            detectedPackage: { name: "react", version: "18.2.0" },
            extensions: [
              {
                ref: companion.ref,
                extension: { installVersion: "1.2.3" },
                attestedBy: ["package", "extension"],
                official: true,
              },
            ],
          },
        ],
      });
      expect(registry.requests).toHaveLength(1);
      expect(registry.requests[0]).toMatchObject({
        method: "POST",
        body: {
          packages: expect.arrayContaining([
            {
              purl: "pkg:npm/react",
              version: "18.2.0",
              declaredExtensions: [{ ref: "@acme/skills/react-review" }],
            },
          ]),
        },
      });
      expect(snapshotDirectory(project.root)).toEqual(before);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(project.cleanup)));
  });

  it.effect("reports an empty project without making a Registry request", () => {
    const project = makeTemporaryProject();
    const registry = makeRecordedRegistryPort(() => ({ body: { results: [] } }));
    return Effect.gen(function* () {
      const client = yield* registry.client;
      const result = yield* discover(project.root, client);
      expect(result).toEqual({ packages: [], totalDetected: 0, registryAvailable: true });
      expect(registry.requests).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(project.cleanup)));
  });

  it.effect("an explicit project directory selects its package and leaves both untouched", () => {
    const project = makeTemporaryProject();
    project.writeJson("package.json", { dependencies: { react: "18.2.0" } });
    project.writeJson("node_modules/react/package.json", { name: "react", version: "18.2.0" });
    project.writeJson("packages/app/package.json", { dependencies: { vite: "5.0.0" } });
    project.writeJson("packages/app/node_modules/vite/package.json", {
      name: "vite",
      version: "5.0.0",
    });
    const requested = nodePath.join(project.root, "packages", "app");
    const before = snapshotDirectory(project.root);
    const viteCompanion = {
      ref: "@acme/skills/vite-review",
      resolved: true,
      extension: { owner: "@acme", type: "skill", name: "vite-review", installVersion: "1.0.0" },
      attestedBy: ["extension"],
      official: false,
      packageVersionInRange: true,
    };
    const registry = makeRecordedRegistryPort(() => ({
      body: {
        results: [
          {
            purl: "pkg:npm/vite",
            version: "5.0.0",
            status: "resolved",
            extensions: [viteCompanion],
          },
          {
            purl: "pkg:npm/react",
            version: "18.2.0",
            status: "resolved",
            extensions: [companion],
          },
        ],
      },
    }));
    return Effect.gen(function* () {
      const client = yield* registry.client;
      const result = yield* discover(requested, client);
      expect(result).toMatchObject({
        totalDetected: 1,
        registryAvailable: true,
        packages: [
          {
            detectedPackage: { name: "vite", version: "5.0.0" },
            extensions: [{ ref: viteCompanion.ref }],
          },
        ],
      });
      expect(registry.requests).toHaveLength(1);
      expect(registry.requests[0]).toMatchObject({
        method: "POST",
        body: { packages: [{ purl: "pkg:npm/vite", version: "5.0.0" }] },
      });
      expect(snapshotDirectory(project.root)).toEqual(before);
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(project.cleanup)));
  });
});

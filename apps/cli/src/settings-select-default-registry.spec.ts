import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace/transitions/settlement/live";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { resolveDefaultRegistryTarget } from "./runtime.js";

export const specification = defineSpecification({
  requirement: "cli/settings-select-default-registry",
  title: "Settings select one default Registry",
  statement:
    "AXM shall select one effective default Registry from project settings, then user settings, then the built-in AgentXM source, and shall use that destination for unqualified resolution, authentication, and publishing without forwarding its credentials to another Registry.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "The composition root reads real project and user settings through the production workspace layer; built-CLI install, authentication, and publish-preview rows are bound evidence for the process boundary.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/help/topics/settings.md",
    "apps/cli/src/runtime.ts",
    "packages/supporting/registry-access/src/credentials/token-resolution.ts",
  ],
  supersedes: [
    "cli/environment-selects-built-in-extension-source",
    "cli/environment-selects-registry-services",
  ],
  assumptions: [],
  openQuestions: [],
});

interface SettingsFixture {
  readonly project: string;
  readonly home: string;
  readonly cleanup: () => void;
}

const makeSettingsFixture = (): SettingsFixture => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-default-registry-"));
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(home, ".axm", "workspace"), { recursive: true });
  return { project, home, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
};

const source = (name: string, location: string) => ({ name, type: "registry", location });

const writeSettings = (file: string, value: unknown): void =>
  fs.writeFileSync(file, JSON.stringify(value));

const resolveTarget = (fixture: SettingsFixture) =>
  resolveDefaultRegistryTarget(decodeAbsolutePathSync(fixture.project)).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.provideMerge(WorkspaceFileWriteLocksLive, NodeServices.layer),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: fixture.home } })),
      ),
    ),
  );

describe("Settings-selected default Registry", () => {
  it.effect("uses the immutable built-in when neither scope selects a source", () => {
    const fixture = makeSettingsFixture();
    return Effect.gen(function* () {
      expect(yield* resolveTarget(fixture)).toEqual({
        name: "agentxm",
        url: "https://registry.agentxm.ai",
      });
    }).pipe(Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("uses the user default when the project has no selection", () => {
    const fixture = makeSettingsFixture();
    writeSettings(path.join(fixture.home, ".axm", "workspace", "axm.json"), {
      defaultRegistry: "company",
      sources: [source("company", "https://registry.company.test")],
    });
    return Effect.gen(function* () {
      expect(yield* resolveTarget(fixture)).toEqual({
        name: "company",
        url: "https://registry.company.test",
      });
    }).pipe(Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("uses the project default before the user default", () => {
    const fixture = makeSettingsFixture();
    writeSettings(path.join(fixture.home, ".axm", "workspace", "axm.json"), {
      defaultRegistry: "company",
      sources: [source("company", "https://registry.company.test")],
    });
    writeSettings(path.join(fixture.project, "axm.json"), {
      defaultRegistry: "project",
      sources: [source("project", "https://registry.project.test")],
    });
    return Effect.gen(function* () {
      expect(yield* resolveTarget(fixture)).toEqual({
        name: "project",
        url: "https://registry.project.test",
      });
    }).pipe(Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("preserves the complete location of a file-backed default Registry", () => {
    const fixture = makeSettingsFixture();
    const registry = path.join(fixture.project, "registry");
    fs.mkdirSync(registry);
    writeSettings(path.join(fixture.project, "axm.json"), {
      defaultRegistry: "fixture",
      sources: [source("fixture", new URL(`file://${registry}`).href)],
    });
    return Effect.gen(function* () {
      expect(yield* resolveTarget(fixture)).toEqual({
        name: "fixture",
        url: new URL(`file://${registry}`).href,
      });
    }).pipe(Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

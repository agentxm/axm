import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach } from "vitest";
import type { CliError } from "../../../cli-error/index.js";
import type { SourceHostConfig } from "../../../settings/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { resolveSkillInstallSource } from "./resolve-skill-install-source.js";

const makeWorkspace = (sources: ReadonlyArray<SourceHostConfig>): WorkspaceContextService => ({
  global: false,
  path: "/tmp/test-workspace",
  nonInteractive: true,
  preview: false,
  resolvePlan: () => Effect.die("not implemented in test"),
  getConfiguredSources: () => Effect.succeed(sources),
  getConfiguredSourceByName: (name: string) =>
    Effect.succeed(Option.fromNullable(sources.find((s) => s.name === name))),
  getConfiguredRegistrySources: (_scope: Option.Option<string>) =>
    Effect.succeed(
      sources.filter(
        (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
      ),
    ),
  getConfiguredScope: () => Effect.succeed("@test") as Effect.Effect<string, CliError>,
  addConfiguredSource: () => Effect.void,
  getConfiguredSkills: () => Effect.succeed({}),
  getInstalledSkills: () => Effect.succeed({}),
  getConfiguredAgents: () => Effect.succeed([]),
  getLockedSkills: () => Effect.succeed({}),
  getLockedSkill: () => Effect.succeed(Option.none()),
  getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
  setSkill: () => Effect.void,
  setSkillLock: () => Effect.void,
  removeSkill: () => Effect.void,
  removeSkillFromSettings: () => Effect.void,
  updateSkillEntry: () => Effect.void,
  setSkillEntry: () => Effect.void,
  renameSkill: () => Effect.void,
  updateLockEntryAgents: () => Effect.void,
  addConfiguredAgent: () => Effect.void,
  getConfiguredPacks: () => Effect.succeed({}),
  getInstalledPacks: () => Effect.succeed({}),
  getLockedPacks: () => Effect.succeed({}),
  getLockedPack: () => Effect.succeed(Option.none()),
  setPack: () => Effect.void,
  removePack: () => Effect.void,
  getPackDir: () => Effect.succeed({ canonicalPath: "" }),
});

const createSkillIndex = (registryRoot: string, scope: string, name: string) => {
  const skillDir = path.join(registryRoot, "extensions", scope, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "index.json"),
    JSON.stringify({
      name,
      scope,
      type: "skill",
      versions: [
        {
          version: "1.0.0",
          published: "2025-01-01T00:00:00Z",
          agents: [],
          checksum: "sha256:deadbeef",
        },
      ],
    }),
  );
};

const provideTestLayers = (sources: ReadonlyArray<SourceHostConfig>) =>
  Layer.mergeAll(NodeContext.layer, Workspace.layer(makeWorkspace(sources)));

describe("resolveSkillInstallSource", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it.effect("selects the first registry that contains the requested scope", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@acme", "my-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource("@acme/my-skill").pipe(
        Effect.provide(provideTestLayers(sources)),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect("supports scope-only input and resolves against a matching registry", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@acme", "my-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource("@acme").pipe(
        Effect.provide(provideTestLayers(sources)),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect("fails when no configured registry contains the requested scope", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const error = yield* resolveSkillInstallSource("@acme/my-skill").pipe(
        Effect.flip,
        Effect.provide(provideTestLayers(sources)),
      );
      expect(error._tag).toBe("CliError");
      expect(error.what).toContain('No registry source contains scope "@acme"');
    });
  });
});

/**
 * Unit tests for the packs unpack command handler.
 *
 * Tests the unpack flow: read locked pack -> build plan with install ops
 * for each extension -> uninstall-pack -> execute plan.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import type { WorkspaceMutationsOptions } from "@agentxm/extension-management/unstable/workspace";
import { SourceHostProviders } from "@agentxm/extension-management/unstable/source-resolution";
import {
  SkillManagerLive,
  type RegistrySkillRef,
} from "@agentxm/extension-management/unstable/skills";
import { HookManagerLive } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/extension-management/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/extension-management/unstable/mcps";
import {
  computePackManifestContentIdentity,
  PackManagerLive,
} from "@agentxm/extension-management/unstable/packs";
import { RuleManagerLive } from "@agentxm/extension-management/unstable/rules";
import { SubagentManagerLive } from "@agentxm/extension-management/unstable/subagents";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getErrorResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
  property,
} from "../../../test-helpers.js";
import { handleUnpack, type UnpackHandlerArgs } from "./handler.js";
import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/agents";
import {
  computeMaterializedTreeIntegritySync,
  exactVersion,
  extensionName,
  handle,
  writeWorkspaceFiles,
} from "../../../test-stubs.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + optional packs. */
const initWorkspace = (
  axmDir: string,
  options: {
    skills?: Record<string, unknown>;
    mcps?: Record<string, unknown>;
    packs?: Record<string, unknown>;
    lockSkills?: Record<string, unknown>;
    lockMcpServers?: Record<string, unknown>;
    lockPacks?: Record<string, unknown>;
  } = {},
) =>
  writeWorkspaceFiles(axmDir, {
    owner: "@test",
    agents: ["claude-code"],
    sources: [{ name: "agentxm", type: "registry", location: "file:///tmp/test-registry" }],
    skills: options.skills,
    mcps: options.mcps,
    packs: options.packs,
    lockfileSkills: options.lockSkills,
    lockfileMcpServers: options.lockMcpServers,
    lockfilePacks: options.lockPacks,
  });

/** Create canonical extension directories on disk (as if pack install placed them). */
const createCanonicalDirs = (
  baseDir: string,
  opts: {
    skills?: ReadonlyArray<{ owner: string; name: string }>;
    mcpServers?: ReadonlyArray<{ owner: string; name: string }>;
  },
) => {
  for (const skill of opts.skills ?? []) {
    const srcDir = path.join(
      baseDir,
      "agent_extensions",
      "agentxm",
      skill.owner,
      "skills",
      skill.name,
      "src",
    );
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(srcDir), "skill.json"),
      JSON.stringify({
        owner: skill.owner,
        type: "skill",
        name: skill.name,
        version: "1.0.0",
      }),
    );
    fs.writeFileSync(
      path.join(srcDir, "SKILL.md"),
      `---\nname: ${skill.name}\ndescription: Test skill\n---\n\n# ${skill.name}`,
    );
  }
  for (const srv of opts.mcpServers ?? []) {
    const srvDir = path.join(baseDir, "agent_extensions", "agentxm", srv.owner, "mcps", srv.name);
    fs.mkdirSync(srvDir, { recursive: true });
    fs.writeFileSync(path.join(srvDir, "server.js"), "module.exports = {}");
  }
  const lockfilePath = path.join(baseDir, "axm-lock.yaml");
  const lockfile = {
    ...expectRecord(YAML.parse(fs.readFileSync(lockfilePath, "utf8"))),
  };
  const withTreeIntegrity = (
    feature: "skills" | "mcpServers",
    entries: ReadonlyArray<{ readonly owner: string; readonly name: string }>,
    directory: "skills" | "mcps",
  ) => {
    const locked = expectRecord(lockfile[feature] ?? {});
    lockfile[feature] = {
      ...locked,
      ...Object.fromEntries(
        entries.map((entry) => {
          const current = expectRecord(locked[entry.name]);
          const root = path.join(
            baseDir,
            "agent_extensions",
            "agentxm",
            entry.owner,
            directory,
            entry.name,
          );
          return [
            entry.name,
            { ...current, treeIntegrity: computeMaterializedTreeIntegritySync(root) },
          ];
        }),
      ),
    };
  };
  withTreeIntegrity("skills", opts.skills ?? [], "skills");
  withTreeIntegrity("mcpServers", opts.mcpServers ?? [], "mcps");
  fs.writeFileSync(lockfilePath, YAML.stringify(lockfile));
};

const createPackManifest = (
  baseDir: string,
  name: string,
  dependencies: Readonly<Record<string, string>>,
) => {
  const packDir = path.join(baseDir, "agent_extensions", "agentxm", "@test", "packs", name);
  fs.mkdirSync(packDir, { recursive: true });
  const manifest = {
    owner: "@test",
    type: "pack" as const,
    name,
    version: "1.0.0",
    dependencies,
  };
  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(manifest));
  const lockfilePath = path.join(baseDir, "axm-lock.yaml");
  const lockfile = expectRecord(YAML.parse(fs.readFileSync(lockfilePath, "utf8")));
  const packs = expectRecord(lockfile["packs"] ?? {});
  const lockedPack = expectRecord(packs[name]);
  const updatedPacks = {
    ...packs,
    [name]: {
      ...lockedPack,
      manifestContentIdentity: computePackManifestContentIdentity(manifest),
      treeIntegrity: computeMaterializedTreeIntegritySync(packDir),
    },
  };
  fs.writeFileSync(lockfilePath, YAML.stringify({ ...lockfile, packs: updatedPacks }));
};

const defaultArgs = (
  name: string,
  overrides: Partial<UnpackHandlerArgs> = {},
): UnpackHandlerArgs => ({
  name,
  yes: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs unpack.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-unpack-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceMutationsOptions>) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
      wsOptions: wsOverrides,
    });
    const SPLayer = Layer.succeed(SourceHostProviders, {
      find: (source, request) =>
        Effect.succeed(
          source.type === "registry" && request.type === "skill"
            ? request.names.map((name): RegistrySkillRef => ({
                type: "skill",
                refType: "registry",
                source,
                skill: {
                  name: extensionName(name),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                owner: handle("@test"),
                name: extensionName(name),
                version: exactVersion(
                  Option.getOrElse(request.versionRange, () => exactVersion("1.0.0")),
                ),
                publisherBindingId: "hbnd_test",
                integrity: Option.none(),
                packages: [],
              }))
            : [],
        ),
      resolveNamedRegistry: () => Effect.die("unused"),
      fetch: () => Effect.die("unused"),
      cloneUrl: () => Option.none(),
      origin: () => "test",
    });
    const CoreLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      handlerTestContext.wsLayer,
      SPLayer,
      CodingAgentRepositoryLive,
    );
    const ManagersLayer = Layer.provide(
      Layer.mergeAll(
        SkillManagerLive,
        McpServerManagerLive,
        SubagentManagerLive,
        RuleManagerLive,
        HookManagerLive,
        KnowledgeManagerLive,
        PackManagerLive,
      ),
      CoreLayer,
    );
    const FullLayer = Layer.merge(CoreLayer, ManagersLayer);
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  describe("full unpack", () => {
    it.effect("promotes resolved skills to direct entries and removes pack", () => {
      const { provide, logs, rendererState } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir, {
        packs: { "frontend-tools": "@test/packs/frontend-tools" },
        lockSkills: {
          "code-review": {
            type: "registry",
            owner: "@test",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "test-writer": {
            type: "registry",
            owner: "@test",
            name: "test-writer",
            resolvedVersion: "2.0.0",
            integrity: "",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        lockPacks: {
          "frontend-tools": {
            type: "registry",
            owner: "@test",
            name: "frontend-tools",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@test/skills/code-review": {
                source: "registry",
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
              "@test/skills/test-writer": {
                source: "registry",
                version: "2.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
            },
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      });

      // Create canonical dirs so install handlers skip fetch
      createCanonicalDirs(tempDir, {
        skills: [
          { owner: "@test", name: "code-review" },
          { owner: "@test", name: "test-writer" },
        ],
      });
      createPackManifest(tempDir, "frontend-tools", {
        "@test/skills/code-review": "^1.0.0",
        "@test/skills/test-writer": "^2.0.0",
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUnpack(defaultArgs("frontend-tools"));

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

          const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
          const result = expectAppliedPlanResult(renderedResult.data, {
            planName: "Unpack pack",
            totalSteps: 1,
          });

          // Check settings: pack should be removed, skills should be added
          const settingsContent = JSON.parse(
            fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8"),
          );
          // Pack should be removed (empty object or undefined)
          const packs = settingsContent.packs ?? {};
          expect(Object.keys(packs)).not.toContain("frontend-tools");
          expect(settingsContent.skills).toBeDefined();
          // Skills are stored by short name (after owner/)
          expect(settingsContent.skills["code-review"]).toBeDefined();
          expect(settingsContent.skills["test-writer"]).toBeDefined();

          // Check lockfile: pack should be removed
          const lockContent = YAML.parse(
            fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8"),
          );
          const lockPacks = lockContent.packs ?? {};
          expect(Object.keys(lockPacks)).not.toContain("frontend-tools");

          const units = planResultUnits(result);
          const graphUnit = expectRecord(expectDefined(units[0], "Expected graph unit"));
          expect(property(graphUnit, "state")).toBe("committed");
          expect(property(graphUnit, "message")).toContain("Unpacked @test/packs/frontend-tools");
        }),
      );
    });
  });

  describe("existing direct entries preserved", () => {
    it.effect("does not overwrite existing direct skill entries", () => {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir, {
        skills: {
          "code-review": { source: "@test/skills/code-review", enabled: false },
        },
        packs: { "frontend-tools": "@test/packs/frontend-tools" },
        lockSkills: {
          "code-review": {
            type: "registry",
            owner: "@test",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "new-skill": {
            type: "registry",
            owner: "@test",
            name: "new-skill",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        lockPacks: {
          "frontend-tools": {
            type: "registry",
            owner: "@test",
            name: "frontend-tools",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@test/skills/code-review": {
                source: "registry",
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
              "@test/skills/new-skill": {
                source: "registry",
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
            },
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      });

      // Create canonical dirs so install handlers skip fetch
      createCanonicalDirs(tempDir, {
        skills: [
          { owner: "@test", name: "code-review" },
          { owner: "@test", name: "new-skill" },
        ],
      });
      createPackManifest(tempDir, "frontend-tools", {
        "@test/skills/code-review": "^1.0.0",
        "@test/skills/new-skill": "^1.0.0",
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUnpack(defaultArgs("frontend-tools"));

          const settingsContent = JSON.parse(
            fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8"),
          );

          // Existing entry should be preserved (code-review was already directly installed)
          // The install handler still runs but the existing settings entry stays
          expect(settingsContent.skills["code-review"]).toBeDefined();

          // New skill from pack should be added
          expect(settingsContent.skills["new-skill"]).toBeDefined();
        }),
      );
    });
  });

  describe("pack not installed", () => {
    it.effect("fails when pack is not in lockfile", () => {
      const { provide, rendererState } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleUnpack(defaultArgs("nonexistent-pack")).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                message: e.detail,
                guidance: (e.suggestions ?? [])
                  .map((suggestion) => `${suggestion.description} · ${suggestion.cmd ?? ""}`)
                  .join("\n"),
              }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.message).toContain("not configured");
          expect(errorResult.guidance).toContain(
            "Install the pack first. · axm packs install <source>",
          );
          expect(rendererState.spinnerMessages).toEqual([]);
        }),
      );
    });
  });

  describe("members without accepted resolution", () => {
    it.effect("refuses to unpack a member without accepted resolution", () => {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");

      initWorkspace(axmDir, {
        packs: { "frontend-tools": "@test/packs/frontend-tools" },
        lockPacks: {
          "frontend-tools": {
            type: "registry",
            owner: "@test",
            name: "frontend-tools",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedMcpServers: {},
            resolvedSubagents: {
              "@test/subagents/reviewer": {
                source: "registry",
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
            },
          },
        },
      });
      createPackManifest(tempDir, "frontend-tools", {
        "@test/subagents/reviewer": "^1.0.0",
      });

      return provide(
        Effect.gen(function* () {
          const result = yield* handleUnpack(defaultArgs("frontend-tools")).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({ error: true, message: e.detail, guidance: "" }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.message).toContain('Accepted subagent identity for "reviewer"');

          // The pack must NOT be removed when unpack refuses.
          const lockContent = YAML.parse(
            fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8"),
          );
          expect(Object.keys(lockContent.packs ?? {})).toContain("frontend-tools");
        }),
      );
    });
  });
});

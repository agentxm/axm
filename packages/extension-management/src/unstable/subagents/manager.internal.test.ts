import { toAppError } from "../app-error/conversions.js";
/**
 * Unit tests for SubagentManager service.
 *
 * Tests cover fresh install with rendering, re-install rendering,
 * uninstall removing rendered files, and settings/lockfile CRUD.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it, vi } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { LocalSubagentRef } from "../workspace/refs/subagent.js";
import type { AddSubagentArgs, CodingAgent } from "../agents/coding-agent.js";
import { CodingAgentRepository } from "../agents/coding-agent.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  makeBaseWorkspaceMock,
  TEST_CONTENT_IDENTITY,
  TEST_TREE_INTEGRITY,
} from "../workspace/test-stubs.js";
import { SubagentManager, SubagentManagerLive } from "./manager.js";
import type { SubagentLockEntry } from "../lockfile/schema.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import { exactVersion, extensionName, handle } from "../test-helpers.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeLocalSubagentRef = (
  name: string,
  sourcePath: string,
  fallback?: "auto" | "none",
): LocalSubagentRef => ({
  type: "subagent",
  refType: "local",
  owner: handle("@acme"),
  name: extensionName(name),
  subagent: {
    name: extensionName(name),
    description: Option.none(),
  },
  source: { type: "local", path: sourcePath },
  location: `file://${sourcePath}`,
  sourcePath: `sources/${name}`,
  ...(fallback === undefined ? {} : { fallback }),
});

const makeSubagentContent = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nYou are a ${name}.`;

const writeSubagentPackage = (packageRoot: string, name: string, description: string) => {
  nodeFs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(packageRoot, "subagent.json"),
    JSON.stringify({
      owner: "@acme",
      type: "subagent",
      name,
      version: "1.0.0",
    }),
  );
  nodeFs.writeFileSync(
    nodePath.join(packageRoot, "src", `${name}.md`),
    makeSubagentContent(name, description),
  );
};

const makeMockCodingAgent = (id: string, overrides?: Partial<CodingAgent>): CodingAgent => ({
  id: id as import("@agentxm/extension-model/unstable/agents/types").AgentId,
  resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  addMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  removeMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  resolveEffectiveSubagentsDir: () =>
    Effect.succeed({
      _tag: "supported",
      dir: `/tmp/.claude/agents`,
      warnings: [],
    }),
  addSubagent: () =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [`.claude/agents/test-agent.md`],
      warnings: [],
    }),
  removeSubagent: () =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [],
      warnings: [],
    }),
  ...overrides,
});

const makeTestLayer = (overrides?: {
  readonly wsOverrides?: Partial<
    import("../workspace/service-interface.js").WorkspaceMutationsService
  >;
  readonly agents?: ReadonlyArray<CodingAgent>;
  readonly axmDir?: string;
}) => {
  const axmDir = overrides?.axmDir ?? "/tmp/test-project/.axm";
  const wsMock = makeBaseWorkspaceMock(axmDir, {
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    ...overrides?.wsOverrides,
  });

  const testAgents = overrides?.agents ?? [makeMockCodingAgent("claude-code")];

  const agentRepoLayer = Layer.succeed(CodingAgentRepository, {
    get: (id) => {
      const found = testAgents.find((a) => a.id === id);
      if (found === undefined) {
        return Effect.fail({
          _tag: "AppError",
          code: "not_found",
          message: `Agent ${id} not found`,
        }) as never;
      }
      return Effect.succeed(found);
    },
    all: Effect.succeed(testAgents),
    getConfiguredAgents: () => Effect.succeed(testAgents),
    getMaterializationAgents: () => Effect.succeed(testAgents),
    getUnknownConfiguredAgentIds: () => Effect.succeed([]),
  });

  return SubagentManagerLive.pipe(
    Layer.provide(Layer.succeed(WorkspaceMutations, wsMock)),
    Layer.provide(agentRepoLayer),
    Layer.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubagentManager", () => {
  describe("isInstalled", () => {
    it.effect("returns false when no subagents are locked", () =>
      Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const result = yield* manager.isInstalled({ target: { type: "subagent", name: "test" } });
        expect(result).toBe(false);
      }).pipe(Effect.provide(makeTestLayer())),
    );

    it.effect("returns false when only an accepted-resolution row names the subagent", () =>
      Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const result = yield* manager.isInstalled({
          target: { type: "subagent", name: "planner" },
        });
        expect(result).toBe(false);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            wsOverrides: {
              getLockedSubagents: () =>
                Effect.succeed({
                  planner: {
                    type: "local",
                    sourceType: "local",
                    sourceName: "local",
                    extensionType: "subagent",
                    workspaceName: extensionName("planner"),
                    packageFormat: "agentxm",
                    packageOwner: handle("@acme"),
                    packageName: extensionName("planner"),
                    path: decodeRelativePathSync("test"),
                    contentIdentity: TEST_CONTENT_IDENTITY,
                    treeIntegrity: TEST_TREE_INTEGRITY,
                  },
                }),
            },
          }),
        ),
      ),
    );
  });

  describe("upsertSettingsEntry", () => {
    it.effect("fails closed when local content was not materialized first", () => {
      const setSubagentSpy = vi.fn(() => Effect.void);

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const error = yield* manager
          .upsertSettingsEntry({
            ref: makeLocalSubagentRef("planner", "/tmp/source/planner"),
            versionRange: Option.none(),
          })
          .pipe(Effect.flip);
        expect(toAppError(error).detail).toContain("no materialized content identity");
        expect(setSubagentSpy).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            wsOverrides: {
              setSubagent: setSubagentSpy,
            },
          }),
        ),
      );
    });
  });

  describe("removeSettingsEntry", () => {
    it.effect("calls ws.removeSubagentSettings", () => {
      const removeSpy = vi.fn(() => Effect.void);

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.removeSettingsEntry({ target: { type: "subagent", name: "planner" } });
        expect(removeSpy).toHaveBeenCalledOnce();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            wsOverrides: {
              removeSubagentSettings: removeSpy,
            },
          }),
        ),
      );
    });
  });

  describe("upsertLockfileEntry", () => {
    it.effect("fails closed when lock persistence has no materialized identity", () => {
      const setLockSpy = vi.fn(() => Effect.void);

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const error = yield* manager
          .upsertLockfileEntry({
            ref: makeLocalSubagentRef("planner", "/tmp/source/planner"),
          })
          .pipe(Effect.flip);
        expect(toAppError(error).detail).toContain("no materialized content identity");
        expect(setLockSpy).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            wsOverrides: {
              setSubagentLock: setLockSpy,
            },
          }),
        ),
      );
    });
  });

  describe("removeLockfileEntry", () => {
    it.effect("calls ws.removeSubagentLock", () => {
      const removeSpy = vi.fn(() => Effect.void);

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.removeLockfileEntry({ target: { type: "subagent", name: "planner" } });
        expect(removeSpy).toHaveBeenCalledOnce();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            wsOverrides: {
              removeSubagentLock: removeSpy,
            },
          }),
        ),
      );
    });
  });

  describe("materializeInstall", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-test-"));
    });

    afterEach(() => {
      nodeFs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it.effect("renders to configured agents without writing lockfile render metadata", () => {
      const setSubagentLockSpy = vi.fn(() => Effect.void);
      const addSubagentCalls: Array<AddSubagentArgs> = [];
      const addSubagentSpy = vi.fn((args: AddSubagentArgs) =>
        Effect.sync(() => {
          addSubagentCalls.push(args);
          return {
            _tag: "success" as const,
            renderedFilePaths: [`.claude/agents/planner.md`],
            warnings: [],
          };
        }),
      );

      const agentWithSpy = makeMockCodingAgent("claude-code", {
        addSubagent: addSubagentSpy,
      });

      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");

      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.materializeInstall({
          ref: makeLocalSubagentRef("planner", sourceDir),
        });
        if (manager.getLastMaterialization === undefined) {
          throw new Error("Subagent materialization observation is unavailable");
        }
        expect(
          yield* manager.getLastMaterialization({
            target: { type: "subagent", name: "planner" },
          }),
        ).toEqual({
          agents: ["claude-code"],
          targets: [
            {
              path: ".claude/agents/planner.md",
              agentIds: ["claude-code"],
            },
          ],
        });
        expect(addSubagentSpy).toHaveBeenCalledOnce();
        expect(addSubagentCalls[0]?.managedFile).toEqual({
          ext: "@acme/subagents/planner",
          source: {
            kind: "acquired",
            path: "agent_extensions/local/sources/planner/src/planner.md",
          },
        });
        expect(setSubagentLockSpy).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [agentWithSpy],
            wsOverrides: {
              setSubagentLock: setSubagentLockSpy,
              getLockedSubagent: () => Effect.succeed(Option.none()),
            },
          }),
        ),
      );
    });

    it.effect("re-renders even when source hash matches", () => {
      const setSubagentLockSpy = vi.fn(() => Effect.void);
      const addSubagentSpy = vi.fn(() =>
        Effect.succeed({
          _tag: "success" as const,
          renderedFilePaths: [],
          warnings: [],
        }),
      );

      const agentWithSpy = makeMockCodingAgent("claude-code", {
        addSubagent: addSubagentSpy,
      });

      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");

      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.materializeInstall({
          ref: makeLocalSubagentRef("planner", sourceDir),
        });
        expect(addSubagentSpy).toHaveBeenCalledOnce();
        expect(setSubagentLockSpy).not.toHaveBeenCalled();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [agentWithSpy],
            wsOverrides: {
              setSubagentLock: setSubagentLockSpy,
              getLockedSubagent: () =>
                Effect.succeed(
                  Option.some({
                    type: "local",
                    sourceType: "local",
                    sourceName: "local",
                    extensionType: "subagent",
                    workspaceName: extensionName("planner"),
                    packageFormat: "agentxm",
                    packageOwner: handle("@acme"),
                    packageName: extensionName("planner"),
                    path: decodeRelativePathSync("sources/planner"),
                    contentIdentity: TEST_CONTENT_IDENTITY,
                    treeIntegrity: TEST_TREE_INTEGRITY,
                  } satisfies SubagentLockEntry),
                ),
            },
          }),
        ),
      );
    });

    it.effect("degrades unsupported subagents to an explicitly reported role skill", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project");
      const axmDir = nodePath.join(projectDir, ".axm");
      const skillsDir = nodePath.join(projectDir, ".cline", "skills");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      let captured: SubagentLockEntry | undefined;
      const fallbackAgent = makeMockCodingAgent("cline", {
        addSubagent: () => Effect.succeed({ _tag: "unsupported", reason: "no native surface" }),
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: skillsDir }),
      });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const ref = makeLocalSubagentRef("planner", sourceDir);
        yield* manager.materializeInstall({ ref });
        if (manager.getLastMaterialization === undefined) {
          throw new Error("Subagent materialization observation is unavailable");
        }
        expect(
          yield* manager.getLastMaterialization({
            target: { type: "subagent", name: "planner" },
          }),
        ).toEqual({
          agents: ["cline"],
          targets: [
            {
              path: ".cline/skills/planner",
              agentIds: ["cline"],
            },
          ],
        });
        yield* manager.upsertLockfileEntry({ ref });

        const skillPath = nodePath.join(skillsDir, "planner", "SKILL.md");
        if (!nodeFs.existsSync(skillPath)) {
          throw new Error(
            `polyfill missing; project entries: ${JSON.stringify(nodeFs.readdirSync(projectDir, { recursive: true }))}`,
          );
        }
        const content = nodeFs.readFileSync(skillPath, "utf8");
        expect(content).toContain("AXM managed projection");
        expect(content).toContain("(acquired, immutable)");
        expect(content).toContain("Use `axm fork`");
        expect(content).not.toContain("Edit:");
        expect(content).toContain("advisory role-skill fallback");
        expect(captured).toHaveProperty("contentIdentity");
        expect(captured).not.toHaveProperty("renderedFiles");
        yield* manager.materializeDeactivate({
          target: { type: "subagent", name: "planner" },
        });
        expect(nodeFs.existsSync(nodePath.dirname(skillPath))).toBe(false);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            axmDir,
            agents: [fallbackAgent],
            wsOverrides: {
              setSubagentLock: (args) =>
                Effect.sync(() => {
                  captured = args.lockEntry;
                }),
            },
          }),
        ),
      );
    });

    it.effect("rejects role-skill degradation when fallback is none", () => {
      const sourceDir = nodePath.join(tmpDir, "source", "planner-native-only");
      writeSubagentPackage(sourceDir, "planner", "Plans work");
      const projectDir = nodePath.join(tmpDir, "project-native-only");
      const axmDir = nodePath.join(projectDir, ".axm");
      nodeFs.mkdirSync(axmDir, { recursive: true });
      const fallbackAgent = makeMockCodingAgent("cline", {
        addSubagent: () => Effect.succeed({ _tag: "unsupported", reason: "no native surface" }),
      });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const error = yield* manager
          .materializeInstall({ ref: makeLocalSubagentRef("planner", sourceDir, "none") })
          .pipe(Effect.flip);
        expect(toAppError(error).detail).toContain("fallback is none");
      }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [fallbackAgent] })));
    });

    it.effect(
      "reports applicable empty coverage when no agent supports a native or fallback surface",
      () => {
        const sourceDir = nodePath.join(tmpDir, "source", "planner");
        writeSubagentPackage(sourceDir, "planner", "Plans work");
        const axmDir = nodePath.join(tmpDir, "project", ".axm");
        nodeFs.mkdirSync(axmDir, { recursive: true });
        const unsupportedAgent = makeMockCodingAgent("cline", {
          addSubagent: () => Effect.succeed({ _tag: "unsupported", reason: "no native surface" }),
          resolveEffectiveSkillsDir: () =>
            Effect.succeed({ _tag: "unsupported", reason: "no skills surface" }),
        });

        return Effect.gen(function* () {
          const manager = yield* SubagentManager;
          yield* manager.materializeInstall({ ref: makeLocalSubagentRef("planner", sourceDir) });
          if (manager.getLastMaterialization === undefined) {
            throw new Error("Subagent materialization observation is unavailable");
          }
          expect(
            yield* manager.getLastMaterialization({
              target: { type: "subagent", name: "planner" },
            }),
          ).toEqual({ agents: [], targets: [] });
        }).pipe(Effect.provide(makeTestLayer({ axmDir, agents: [unsupportedAgent] })));
      },
    );
  });

  describe("materializeUninstall", () => {
    it.effect("removes rendered files via agent and cleans canonical", () => {
      const removeSubagentSpy = vi.fn(() =>
        Effect.succeed({
          _tag: "success" as const,
          renderedFilePaths: [],
          warnings: [],
        }),
      );

      const agentWithSpy = makeMockCodingAgent("claude-code", {
        removeSubagent: removeSubagentSpy,
      });

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.materializeUninstall({
          target: { type: "subagent", name: "planner" },
        });
        expect(removeSubagentSpy).toHaveBeenCalledOnce();
      }).pipe(
        Effect.provide(
          makeTestLayer({
            agents: [agentWithSpy],
            wsOverrides: {
              getLockedSubagent: () =>
                Effect.succeed(
                  Option.some({
                    type: "local",
                    sourceType: "local",
                    sourceName: "local",
                    extensionType: "subagent",
                    workspaceName: extensionName("planner"),
                    packageFormat: "agentxm",
                    packageOwner: handle("@acme"),
                    packageName: extensionName("planner"),
                    path: decodeRelativePathSync("tmp/source/planner"),
                    contentIdentity: TEST_CONTENT_IDENTITY,
                    treeIntegrity: TEST_TREE_INTEGRITY,
                  } satisfies SubagentLockEntry),
                ),
            },
          }),
        ),
      );
    });

    it.effect("removes registry canonical subagent directories", () => {
      const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-subagent-uninstall-"));
      const axmDir = nodePath.join(tmpDir, "project", ".axm");
      const canonicalDir = nodePath.join(
        tmpDir,
        "project",
        "agent_extensions",
        "agentxm",
        "@test",
        "subagents",
        "planner",
      );

      return Effect.gen(function* () {
        yield* Effect.sync(() => {
          nodeFs.mkdirSync(nodePath.join(canonicalDir, "src"), { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(canonicalDir, "src", "planner.md"),
            makeSubagentContent("planner", "Plans work"),
          );
        });

        const manager = yield* SubagentManager;
        yield* manager.materializeUninstall({
          target: { type: "subagent", name: "planner" },
        });

        expect(nodeFs.existsSync(canonicalDir)).toBe(false);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            nodeFs.rmSync(tmpDir, { recursive: true, force: true });
          }),
        ),
        Effect.provide(
          makeTestLayer({
            axmDir,
            wsOverrides: {
              getConfiguredSubagentEntries: () =>
                Effect.succeed({
                  planner: { source: "@test/subagents/planner", enabled: true },
                }),
              getLockedSubagent: () =>
                Effect.succeed(
                  Option.some({
                    type: "registry",
                    sourceType: "registry",
                    packageFormat: "agentxm",
                    endpoint: new URL("https://registry.agentxm.ai"),
                    extensionType: "subagent",
                    workspaceName: extensionName("planner"),
                    owner: handle("@test"),
                    name: extensionName("planner"),
                    resolvedVersion: exactVersion("1.0.0"),
                    integrity: "sha512-test",
                    sourceName: "agentxm",
                    publisherBindingId: "hbnd_test",
                    treeIntegrity: TEST_TREE_INTEGRITY,
                  } satisfies SubagentLockEntry),
                ),
            },
          }),
        ),
      );
    });

    it.effect("handles missing lockfile entry gracefully", () =>
      Effect.gen(function* () {
        const manager = yield* SubagentManager;
        // Should not throw — just skip removal
        yield* manager.materializeUninstall({
          target: { type: "subagent", name: "nonexistent" },
        });
      }).pipe(
        Effect.provide(
          makeTestLayer({
            wsOverrides: {
              getLockedSubagent: () => Effect.succeed(Option.none()),
            },
          }),
        ),
      ),
    );
  });
});

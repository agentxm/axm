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
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { LocalSubagentRef } from "./refs.js";
import type { CodingAgent } from "../agents/coding-agent.js";
import { CodingAgentRepository } from "../agents/coding-agent.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { SubagentManager, SubagentManagerLive } from "./manager.js";
import { RenderedFilesMapSchema } from "../extensions/rendered-files.js";
import type { SubagentLockEntry } from "../lockfile/schema.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeLocalSubagentRef = (name: string, sourcePath: string): LocalSubagentRef => ({
  type: "subagent",
  refType: "local",
  subagent: {
    name: name as import("../extensions/common.js").ExtensionName,
    description: Option.none(),
  },
  source: { type: "local", path: sourcePath },
  location: `file://${sourcePath}`,
});

const makeSubagentContent = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nYou are a ${name}.`;

const makeMockCodingAgent = (id: string, overrides?: Partial<CodingAgent>): CodingAgent => ({
  id: id as import("../agents/types.js").AgentId,
  resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  addMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  removeMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  resolveEffectiveCommandsDir: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  addCommand: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
  removeCommand: () => Effect.succeed({ _tag: "unsupported", reason: "not used" }),
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
    getUnknownConfiguredAgentIds: () => Effect.succeed([]),
  });

  return SubagentManagerLive.pipe(
    Layer.provide(Layer.succeed(WorkspaceMutations, wsMock)),
    Layer.provide(agentRepoLayer),
    Layer.provide(NodeServices.layer),
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

    it.effect("returns true when subagent is in lockfile", () =>
      Effect.gen(function* () {
        const manager = yield* SubagentManager;
        const result = yield* manager.isInstalled({
          target: { type: "subagent", name: "planner" },
        });
        expect(result).toBe(true);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            wsOverrides: {
              getLockedSubagents: () =>
                Effect.succeed({
                  planner: {
                    type: "local",
                    path: "/test",
                    agents: ["claude-code"],
                    installedAt: new Date(),
                    updatedAt: new Date(),
                  },
                }),
            },
          }),
        ),
      ),
    );
  });

  describe("upsertSettingsEntry", () => {
    it.effect("calls ws.setSubagent for local ref", () => {
      const setSubagentSpy = vi.fn(() => Effect.void);

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.upsertSettingsEntry({
          ref: makeLocalSubagentRef("planner", "/tmp/source/planner"),
          versionConstraint: Option.none(),
        });
        expect(setSubagentSpy).toHaveBeenCalledOnce();
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
    it.effect("calls ws.setSubagentLock for local ref", () => {
      const setLockSpy = vi.fn(() => Effect.void);

      return Effect.gen(function* () {
        const manager = yield* SubagentManager;
        yield* manager.upsertLockfileEntry({
          ref: makeLocalSubagentRef("planner", "/tmp/source/planner"),
        });
        expect(setLockSpy).toHaveBeenCalledOnce();
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
      const addSubagentSpy = vi.fn(() =>
        Effect.succeed({
          _tag: "success" as const,
          renderedFilePaths: [`.claude/agents/planner.md`],
          warnings: [],
        }),
      );

      const agentWithSpy = makeMockCodingAgent("claude-code", {
        addSubagent: addSubagentSpy,
      });

      // Create source directory with planner.md
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      nodeFs.mkdirSync(sourceDir, { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(sourceDir, "planner.md"),
        makeSubagentContent("planner", "Plans work"),
      );

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

      // Create source directory with planner.md
      const sourceDir = nodePath.join(tmpDir, "source", "planner");
      nodeFs.mkdirSync(sourceDir, { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(sourceDir, "planner.md"),
        makeSubagentContent("planner", "Plans work"),
      );

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
                    path: sourceDir,
                    agents: ["claude-code"],
                    installedAt: new Date(),
                    updatedAt: new Date(),
                    sourceHash: "stale-hash",
                  } satisfies SubagentLockEntry),
                ),
            },
          }),
        ),
      );
    });
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

      const decodeRenderedFiles = Schema.decodeUnknownSync(RenderedFilesMapSchema);
      const renderedFiles = decodeRenderedFiles({
        "claude-code": [{ path: ".claude/agents/planner.md" }],
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
                    path: "/tmp/source/planner",
                    agents: ["claude-code"],
                    installedAt: new Date(),
                    updatedAt: new Date(),
                    renderedFiles,
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
        ".axm",
        "extensions",
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
              getLockedSubagent: () => Effect.succeed(Option.none()),
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

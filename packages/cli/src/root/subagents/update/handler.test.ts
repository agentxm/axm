/**
 * Unit tests for the subagents update handler.
 *
 * Tests the re-resolution, change detection, selective update, and preview flows.
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
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { SubagentManagerLive } from "@axm.sh/core/unstable/subagents";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    subagents?: Record<string, string>;
    subagentLocks?: Record<string, unknown>;
    sources?: ReadonlyArray<Record<string, unknown>>;
    agents?: string[];
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = {
    agents: opts?.agents ?? ["claude-code"],
  };
  if (opts?.subagents) settings["subagents"] = opts.subagents;
  if (opts?.sources) settings["sources"] = opts.sources;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = {
    lockfileVersion: 1,
    skills: {},
    subagents: opts?.subagentLocks ?? {},
  };
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

const defaultArgs = (overrides: Partial<UpdateHandlerArgs> = {}): UpdateHandlerArgs => ({
  source: Option.none(),
  agents: [],
  subagents: [],
  force: false,
  yes: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents-update.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
    });
    const BaseLayer = handlerTestContext.baseLayer;
    const WsLayer = handlerTestContext.wsLayer;
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const AgentRepoLayer = Layer.provide(CodingAgentRepositoryLive, WsLayer);
    const SubagentMgrLayer = Layer.provide(
      SubagentManagerLive,
      Layer.mergeAll(WsLayer, AgentRepoLayer, BaseLayer),
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer, AgentRepoLayer, SubagentMgrLayer);
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  describe("no subagents installed", () => {
    it.effect("reports nothing to update when no subagents are installed", () => {
      const { provide, logs } = makeLayers();

      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs());

          expect(logs.info.some((m) => m.includes("No subagents installed"))).toBe(true);
        }),
      );
    });
  });

  describe("selective update with --subagent filter", () => {
    it.effect("filters by --subagent flag", () => {
      const { provide, logs } = makeLayers();

      const now = new Date().toISOString();
      initWorkspace(path.join(tempDir, ".axm"), {
        subagents: {
          researcher: "file:///nonexistent/path",
          summarizer: "file:///nonexistent/path2",
        },
        subagentLocks: {
          researcher: {
            type: "local",
            path: "/nonexistent/path",
            agents: ["claude-code"],
            installedAt: now,
            updatedAt: now,
          },
          summarizer: {
            type: "local",
            path: "/nonexistent/path2",
            agents: ["claude-code"],
            installedAt: now,
            updatedAt: now,
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          // Filter to only "nonexistent-*" which matches nothing
          yield* handleUpdate(defaultArgs({ subagents: ["nonexistent-*"] }));

          expect(
            logs.warn.some((m) => m.includes("No installed subagents match the --subagent filter")),
          ).toBe(true);
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("reports nothing to update for empty lockfile in preview mode", () => {
      const { provide, logs } = makeLayers();

      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultArgs({ preview: true }));

          expect(logs.info.some((m) => m.includes("No subagents installed"))).toBe(true);
        }),
      );
    });
  });
});

/**
 * Tests for apply module - executing workspace initialization.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentConfig, AgentId } from "../agents/types.js";
import { applyInitDiff } from "./apply.js";
import { InitChange } from "./types.js";

// Helper to create test AgentConfig
const makeAgent = (id: AgentId, name: string, projectDir: string): AgentConfig => ({
  id,
  name,
  skills: { projectDir, globalDir: Option.none() },
});

// Test helpers
const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

describe("applyInitDiff", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    axmDir = nodePath.join(tempDir, ".axm");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  describe("Add change", () => {
    it("creates .axm directory and settings.json", async () => {
      const change = InitChange.Add({
        agents: [makeAgent("claude-code", "Claude Code", ".claude/skills")],
        scope: "@community",
      });

      await runEffect(applyInitDiff(change, { axmDir }));

      const exists = await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.exists(nodePath.join(axmDir, "settings.json"));
        }),
      );
      expect(exists).toBe(true);
    });

    it("writes settings with agents array containing agent IDs", async () => {
      const change = InitChange.Add({
        agents: [
          makeAgent("claude-code", "Claude Code", ".claude/skills"),
          makeAgent("cursor", "Cursor", ".cursor/skills"),
        ],
        scope: "@community",
      });

      await runEffect(applyInitDiff(change, { axmDir }));

      const content = await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString(nodePath.join(axmDir, "settings.json"));
        }),
      );
      const settings = JSON.parse(content) as { agents?: string[]; scope?: string };
      expect(settings.agents).toEqual(["claude-code", "cursor"]);
    });

    it("writes settings with scope set to @community", async () => {
      const change = InitChange.Add({
        agents: [makeAgent("claude-code", "Claude Code", ".claude/skills")],
        scope: "@community",
      });

      await runEffect(applyInitDiff(change, { axmDir }));

      const content = await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString(nodePath.join(axmDir, "settings.json"));
        }),
      );
      const settings = JSON.parse(content) as { agents?: string[]; scope?: string };
      expect(settings.scope).toBe("@community");
    });

    it("writes valid JSON with pretty formatting", async () => {
      const change = InitChange.Add({
        agents: [makeAgent("claude-code", "Claude Code", ".claude/skills")],
        scope: "@community",
      });

      await runEffect(applyInitDiff(change, { axmDir }));

      const content = await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString(nodePath.join(axmDir, "settings.json"));
        }),
      );
      // Should have newlines (pretty printed)
      expect(content).toContain("\n");
      // Should parse successfully
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  describe("Update change", () => {
    it("overwrites existing settings.json", async () => {
      // Create existing settings
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(axmDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(axmDir, "settings.json"),
            JSON.stringify({ agents: ["cursor"], scope: "@old" }),
          );
        }),
      );

      const change = InitChange.Update(
        { agents: ["cursor"], scope: "@old" },
        {
          agents: [makeAgent("claude-code", "Claude Code", ".claude/skills")],
          scope: "@community",
        },
      );

      await runEffect(applyInitDiff(change, { axmDir }));

      const content = await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString(nodePath.join(axmDir, "settings.json"));
        }),
      );
      const settings = JSON.parse(content) as { agents?: string[]; scope?: string };
      expect(settings.agents).toEqual(["claude-code"]);
      expect(settings.scope).toBe("@community");
    });

    it("preserves existing skills configuration", async () => {
      // Create existing settings with skills
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(axmDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(axmDir, "settings.json"),
            JSON.stringify({
              agents: ["cursor"],
              scope: "@old",
              skills: { "my-skill": "/path/to/skill" },
            }),
          );
        }),
      );

      const change = InitChange.Update(
        { agents: ["cursor"], scope: "@old", skills: { "my-skill": "/path/to/skill" } },
        {
          agents: [makeAgent("claude-code", "Claude Code", ".claude/skills")],
          scope: "@community",
        },
      );

      await runEffect(applyInitDiff(change, { axmDir }));

      const content = await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString(nodePath.join(axmDir, "settings.json"));
        }),
      );
      const settings = JSON.parse(content) as {
        agents?: string[];
        scope?: string;
        skills?: Record<string, string>;
      };
      expect(settings.skills).toEqual({ "my-skill": "/path/to/skill" });
    });
  });

  describe("Unchanged change", () => {
    it("does not modify settings.json", async () => {
      const originalContent = JSON.stringify({ agents: ["claude-code"], scope: "@community" });

      // Create existing settings
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(axmDir, { recursive: true });
          yield* fs.writeFileString(nodePath.join(axmDir, "settings.json"), originalContent);
        }),
      );

      const change = InitChange.Unchanged({ agents: ["claude-code"], scope: "@community" });

      await runEffect(applyInitDiff(change, { axmDir }));

      const content = await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return yield* fs.readFileString(nodePath.join(axmDir, "settings.json"));
        }),
      );
      expect(content).toBe(originalContent);
    });

    it("returns void without error", async () => {
      // Create existing settings
      await runEffect(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(axmDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(axmDir, "settings.json"),
            JSON.stringify({ agents: ["claude-code"], scope: "@community" }),
          );
        }),
      );

      const change = InitChange.Unchanged({ agents: ["claude-code"], scope: "@community" });

      // Should not throw
      await expect(runEffect(applyInitDiff(change, { axmDir }))).resolves.toBeUndefined();
    });
  });
});

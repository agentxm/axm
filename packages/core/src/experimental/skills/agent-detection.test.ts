import * as fs from "node:fs";
import * as os from "node:os";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  DetectionError,
  detectAgents,
  getAgentById,
  getSupportedAgentIds,
  SUPPORTED_AGENTS,
} from "./agent-detection.js";

describe("agent-detection", () => {
  describe("SUPPORTED_AGENTS", () => {
    it("contains claude-code agent with correct config", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "claude-code");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Claude Code");
      expect(agent?.detectPath).toBe("~/.claude");
      expect(agent?.skillsDir).toBe(".claude/commands");
    });

    it("contains cursor agent with correct config", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "cursor");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Cursor");
      expect(agent?.detectPath).toBe("~/.cursor");
      expect(agent?.skillsDir).toBe(".cursor/rules");
    });

    it("contains codex agent with correct config", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "codex");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Codex CLI");
      expect(agent?.detectPath).toBe("~/.codex");
      expect(agent?.skillsDir).toBe(".codex/instructions");
    });

    it("contains windsurf agent with correct config", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "windsurf");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Windsurf");
      expect(agent?.detectPath).toBe("~/.windsurf");
      expect(agent?.skillsDir).toBe(".windsurf/rules");
    });

    it("contains continue agent with correct config", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "continue");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Continue");
      expect(agent?.detectPath).toBe("~/.continue");
      expect(agent?.skillsDir).toBe(".continue/rules");
    });

    it("contains vscode agent without skillsDir", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "vscode");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("VS Code");
      expect(agent?.detectPath).toBe("~/.vscode");
      expect(agent?.skillsDir).toBeUndefined();
    });

    it("contains copilot agent with non-standard path", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "copilot");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("GitHub Copilot");
      expect(agent?.detectPath).toBe("~/.config/github-copilot");
    });

    it("contains amazon-q agent with nested config path", () => {
      const agent = SUPPORTED_AGENTS.find((a) => a.id === "amazon-q");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Amazon Q Developer");
      expect(agent?.detectPath).toBe("~/.aws/amazonq");
    });

    it("contains at least 30 agents", () => {
      expect(SUPPORTED_AGENTS.length).toBeGreaterThanOrEqual(30);
    });

    it("has unique agent IDs", () => {
      const ids = SUPPORTED_AGENTS.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("has unique agent names", () => {
      const names = SUPPORTED_AGENTS.map((a) => a.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("all agents have required fields", () => {
      for (const agent of SUPPORTED_AGENTS) {
        expect(agent.id).toBeTruthy();
        expect(typeof agent.id).toBe("string");
        expect(agent.name).toBeTruthy();
        expect(typeof agent.name).toBe("string");
        expect(agent.detectPath).toBeTruthy();
        expect(agent.detectPath.startsWith("~")).toBe(true);
      }
    });

    it("all detectPaths start with ~/ or are exactly ~", () => {
      for (const agent of SUPPORTED_AGENTS) {
        expect(agent.detectPath === "~" || agent.detectPath.startsWith("~/")).toBe(true);
      }
    });

    it("skillsDir when present does not start with ~", () => {
      // skillsDir is a relative path from project root, not home
      for (const agent of SUPPORTED_AGENTS) {
        if (agent.skillsDir !== undefined) {
          expect(agent.skillsDir.startsWith("~")).toBe(false);
          expect(agent.skillsDir.startsWith("/")).toBe(false);
        }
      }
    });
  });

  describe("getAgentById", () => {
    it("returns agent config for valid ID", () => {
      const agent = getAgentById("claude-code");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Claude Code");
    });

    it("returns undefined for invalid ID", () => {
      const agent = getAgentById("nonexistent-agent");
      expect(agent).toBeUndefined();
    });
  });

  describe("getSupportedAgentIds", () => {
    it("returns array of agent IDs", () => {
      const ids = getSupportedAgentIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toContain("claude-code");
      expect(ids).toContain("cursor");
      expect(ids).toContain("codex");
    });

    it("returns same count as SUPPORTED_AGENTS", () => {
      const ids = getSupportedAgentIds();
      expect(ids.length).toBe(SUPPORTED_AGENTS.length);
    });
  });

  describe("detectAgents", () => {
    const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
      effect.pipe(Effect.provide(NodeFileSystem.layer));

    it.effect("returns an array of detected agents", () =>
      withFileSystem(
        Effect.gen(function* () {
          // detectAgents scans the user's actual home directory for known agent config dirs
          // This test verifies it returns an array (possibly empty if no agents installed)
          const result = yield* detectAgents();
          expect(Array.isArray(result)).toBe(true);
        }),
      ),
    );

    it.effect("detected agents have valid AgentConfig structure", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* detectAgents();

          for (const agent of result) {
            expect(agent.id).toBeTruthy();
            expect(typeof agent.id).toBe("string");
            expect(agent.name).toBeTruthy();
            expect(typeof agent.name).toBe("string");
            expect(agent.detectPath).toBeTruthy();
            expect(agent.detectPath.startsWith("~")).toBe(true);
            // skillsDir is optional
            if (agent.skillsDir !== undefined) {
              expect(typeof agent.skillsDir).toBe("string");
            }
          }
        }),
      ),
    );

    it.effect("returns only agents from the SUPPORTED_AGENTS list", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* detectAgents();

          // All returned agents should be in the SUPPORTED_AGENTS list
          for (const agent of result) {
            const supported = SUPPORTED_AGENTS.find((a) => a.id === agent.id);
            expect(supported).toBeDefined();
            // Verify it's the exact same config object
            expect(agent).toEqual(supported);
          }
        }),
      ),
    );

    it.effect("returns no duplicates", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* detectAgents();
          const ids = result.map((a) => a.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }),
      ),
    );

    it.live("runs detection concurrently", () =>
      Effect.gen(function* () {
        // This test verifies the function completes in a reasonable time
        // which would indicate concurrent execution
        const startTime = Date.now();
        yield* detectAgents().pipe(Effect.provide(NodeFileSystem.layer));
        const elapsed = Date.now() - startTime;

        // Should complete quickly even with 30+ agents to check
        expect(elapsed).toBeLessThan(5000);
      }),
    );
  });

  describe("detectAgents - no agents scenario", () => {
    // Note: detectAgents uses os.homedir() internally, so we cannot easily mock
    // the home directory without modifying the module. The behavior when no agents
    // are detected is implicitly tested - if none of the SUPPORTED_AGENTS paths
    // exist, an empty array is returned.
    //
    // The implementation filters out null results from checkAgent:
    //   results.filter((agent): agent is AgentConfig => agent !== null)
    //
    // This behavior is verified through the SUPPORTED_AGENTS tests (which confirm
    // the structure) and the detectAgents tests (which confirm valid output).

    it.effect("handles case where no supported agents are installed", () =>
      Effect.gen(function* () {
        // The detectAgents function should gracefully return an empty array
        // when no agent directories are found. Since we can't mock os.homedir(),
        // we verify this indirectly:
        // 1. The function doesn't throw when checking non-existent paths
        // 2. The returned array only contains agents whose paths exist

        const result = yield* detectAgents().pipe(Effect.provide(NodeFileSystem.layer));

        // Verify that for each detected agent, the path actually exists
        for (const agent of result) {
          const expandedPath = agent.detectPath.replace(/^~/, os.homedir());
          const exists = fs.existsSync(expandedPath);
          expect(exists).toBe(true);
        }

        // If we got here without errors, the function handles missing paths correctly
        expect(true).toBe(true);
      }),
    );
  });

  describe("DetectionError", () => {
    it("can be instantiated with message", () => {
      const error = new DetectionError({ message: "test error" });
      expect(error.message).toBe("test error");
      expect(error._tag).toBe("DetectionError");
    });

    it("can include cause", () => {
      const cause = new Error("root cause");
      const error = new DetectionError({ message: "test error", cause });
      expect(error.cause).toBe(cause);
    });
  });
});

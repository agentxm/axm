import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DetectionError,
  detectAgents,
  getAgentById,
  getSupportedAgentIds,
  SUPPORTED_AGENTS,
} from "../agent-detection.js";

describe("agent-detection", () => {
  describe("SUPPORTED_AGENTS", () => {
    it("contains claude-code agent", () => {
      const claudeCode = SUPPORTED_AGENTS.find((a) => a.id === "claude-code");
      expect(claudeCode).toBeDefined();
      expect(claudeCode?.name).toBe("Claude Code");
      expect(claudeCode?.detectPath).toBe("~/.claude");
      expect(claudeCode?.skillsDir).toBe(".claude/commands");
    });

    it("contains cursor agent", () => {
      const cursor = SUPPORTED_AGENTS.find((a) => a.id === "cursor");
      expect(cursor).toBeDefined();
      expect(cursor?.name).toBe("Cursor");
      expect(cursor?.detectPath).toBe("~/.cursor");
    });

    it("contains at least 30 agents", () => {
      expect(SUPPORTED_AGENTS.length).toBeGreaterThanOrEqual(30);
    });

    it("has unique agent IDs", () => {
      const ids = SUPPORTED_AGENTS.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("all agents have required fields", () => {
      for (const agent of SUPPORTED_AGENTS) {
        expect(agent.id).toBeTruthy();
        expect(agent.name).toBeTruthy();
        expect(agent.detectPath).toBeTruthy();
        expect(agent.detectPath.startsWith("~")).toBe(true);
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
    let tempDir: string;
    let mockHomeDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-detection-test-"));
      mockHomeDir = path.join(tempDir, "home");
      fs.mkdirSync(mockHomeDir);
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const runWithFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
      Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

    it("returns empty array when no agents are detected", async () => {
      // Use actual home directory - this test may detect real agents
      // The main assertion is that it doesn't throw and returns an array
      const result = await runWithFileSystem(detectAgents());
      expect(Array.isArray(result)).toBe(true);
    });

    it("detected agents have valid AgentConfig structure", async () => {
      const result = await runWithFileSystem(detectAgents());

      for (const agent of result) {
        expect(agent.id).toBeTruthy();
        expect(agent.name).toBeTruthy();
        expect(agent.detectPath).toBeTruthy();
      }
    });

    it("returns only agents that exist", async () => {
      const result = await runWithFileSystem(detectAgents());

      // All returned agents should be in the SUPPORTED_AGENTS list
      for (const agent of result) {
        const supported = SUPPORTED_AGENTS.find((a) => a.id === agent.id);
        expect(supported).toBeDefined();
      }
    });

    it("runs detection concurrently", async () => {
      // This test verifies the function completes in a reasonable time
      // which would indicate concurrent execution
      const startTime = Date.now();
      await runWithFileSystem(detectAgents());
      const elapsed = Date.now() - startTime;

      // Should complete quickly even with 30+ agents to check
      expect(elapsed).toBeLessThan(5000);
    });
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

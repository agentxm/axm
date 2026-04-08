/**
 * Tests for subagent file detection in agent directories.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { scanAgentSubagentFiles, scanAllSubagentFiles } from "./subagent-detection.js";
import type { AgentDescriptor } from "./types.js";
import { afterEach, beforeEach } from "vitest";
import { generateMarker } from "../extensions/managed-marker.js";

// =============================================================================
// Test Fixtures
// =============================================================================

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-detection-test-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const withNode = <A, E>(effect: Effect.Effect<A, E, never>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Agent with subagents directory */
const claudeCode: AgentDescriptor = {
  id: "claude-code",
  name: "Claude Code",
  skills: { dir: ".claude/skills" },
  commands: { dir: ".claude/commands" },
  subagents: { dir: ".claude/agents" },
};

/** Agent with subagents as a single file (Roo Code) */
const roo: AgentDescriptor = {
  id: "roo",
  name: "Roo Code",
  skills: { dir: ".roo/skills" },
  commands: { dir: ".roo/commands" },
  subagents: { dir: ".roomodes", isFile: true },
};

/** Agent without subagents support */
const cline: AgentDescriptor = {
  id: "cline",
  name: "Cline",
  skills: { dir: ".cline/skills" },
};

// =============================================================================
// scanAgentSubagentFiles Tests
// =============================================================================

describe("scanAgentSubagentFiles", () => {
  describe("agent without subagents descriptor", () => {
    it.effect("returns empty array for agent without subagents", () =>
      withNode(
        Effect.gen(function* () {
          const result = yield* scanAgentSubagentFiles(cline, tempDir);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("subagent directory does not exist", () => {
    it.effect("returns empty array when directory is missing", () =>
      withNode(
        Effect.gen(function* () {
          const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("subagent directory with files", () => {
    it.effect("detects unmanaged subagent files", () =>
      withNode(
        Effect.gen(function* () {
          const agentsDir = path.join(tempDir, ".claude", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });
          fs.writeFileSync(path.join(agentsDir, "my-agent.md"), "# My Agent\nSome instructions");

          const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
          expect(result).toHaveLength(1);
          expect(result[0]?.path).toBe(path.join(".claude/agents", "my-agent.md"));
          expect(result[0]?.managed).toBe(false);
        }),
      ),
    );

    it.effect("detects managed subagent files", () =>
      withNode(
        Effect.gen(function* () {
          const agentsDir = path.join(tempDir, ".claude", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });
          const marker = generateMarker("subagents", "markdown");
          fs.writeFileSync(
            path.join(agentsDir, "managed-agent.md"),
            `${marker}\n# Managed Agent\nInstructions`,
          );

          const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
          expect(result).toHaveLength(1);
          expect(result[0]?.path).toBe(path.join(".claude/agents", "managed-agent.md"));
          expect(result[0]?.managed).toBe(true);
        }),
      ),
    );

    it.effect("classifies mixed managed and unmanaged files", () =>
      withNode(
        Effect.gen(function* () {
          const agentsDir = path.join(tempDir, ".claude", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });

          const marker = generateMarker("subagents", "markdown");
          fs.writeFileSync(path.join(agentsDir, "managed.md"), `${marker}\n# Managed`);
          fs.writeFileSync(path.join(agentsDir, "unmanaged.md"), "# Unmanaged");

          const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
          expect(result).toHaveLength(2);

          const managedFiles = result.filter((f) => f.managed);
          const unmanagedFiles = result.filter((f) => !f.managed);
          expect(managedFiles).toHaveLength(1);
          expect(unmanagedFiles).toHaveLength(1);
        }),
      ),
    );

    it.effect("skips subdirectories", () =>
      withNode(
        Effect.gen(function* () {
          const agentsDir = path.join(tempDir, ".claude", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });
          fs.mkdirSync(path.join(agentsDir, "subdir"), { recursive: true });
          fs.writeFileSync(path.join(agentsDir, "agent.md"), "# Agent");

          const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
          expect(result).toHaveLength(1);
          expect(result[0]?.path).toBe(path.join(".claude/agents", "agent.md"));
        }),
      ),
    );
  });

  describe("single-file subagent path (Roo Code .roomodes)", () => {
    it.effect("detects unmanaged .roomodes file", () =>
      withNode(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, ".roomodes"), '{"customModes": []}');

          const result = yield* scanAgentSubagentFiles(roo, tempDir);
          expect(result).toHaveLength(1);
          expect(result[0]?.path).toBe(".roomodes");
          expect(result[0]?.managed).toBe(false);
        }),
      ),
    );

    it.effect("detects managed .roomodes file", () =>
      withNode(
        Effect.gen(function* () {
          const marker = generateMarker("subagents", "text");
          fs.writeFileSync(path.join(tempDir, ".roomodes"), `${marker}\n{"customModes": []}`);

          const result = yield* scanAgentSubagentFiles(roo, tempDir);
          expect(result).toHaveLength(1);
          expect(result[0]?.path).toBe(".roomodes");
          expect(result[0]?.managed).toBe(true);
        }),
      ),
    );

    it.effect("returns empty when .roomodes does not exist", () =>
      withNode(
        Effect.gen(function* () {
          const result = yield* scanAgentSubagentFiles(roo, tempDir);
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// =============================================================================
// scanAllSubagentFiles Tests
// =============================================================================

describe("scanAllSubagentFiles", () => {
  it.effect("returns only agents with found subagent files", () =>
    withNode(
      Effect.gen(function* () {
        // Create subagent file for claude-code only
        const agentsDir = path.join(tempDir, ".claude", "agents");
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, "agent.md"), "# Agent");

        const result = yield* scanAllSubagentFiles([claudeCode, roo, cline], tempDir);
        expect(result).toHaveLength(1);
        expect(result[0]?.agentId).toBe("claude-code");
        expect(result[0]?.agentName).toBe("Claude Code");
        expect(result[0]?.subagentDir).toBe(".claude/agents");
        expect(result[0]?.files).toHaveLength(1);
      }),
    ),
  );

  it.effect("returns empty array when no agents have subagent files", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAllSubagentFiles([claudeCode, roo], tempDir);
        expect(result).toEqual([]);
      }),
    ),
  );

  it.effect("includes multiple agents with subagent files", () =>
    withNode(
      Effect.gen(function* () {
        // Create subagent files for both claude-code and roo
        const agentsDir = path.join(tempDir, ".claude", "agents");
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, "agent.md"), "# Agent");

        fs.writeFileSync(path.join(tempDir, ".roomodes"), '{"customModes": []}');

        const result = yield* scanAllSubagentFiles([claudeCode, roo], tempDir);
        expect(result).toHaveLength(2);
        const ids = result.map((r) => r.agentId);
        expect(ids).toContain("claude-code");
        expect(ids).toContain("roo");
      }),
    ),
  );
});

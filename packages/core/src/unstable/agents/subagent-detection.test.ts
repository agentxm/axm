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

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-detection-test-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

const claudeCode: AgentDescriptor = {
  id: "claude-code",
  name: "Claude Code",
  skills: { dir: ".claude/skills" },
  commands: { dir: ".claude/commands" },
  subagents: { dir: ".claude/agents" },
};

const roo: AgentDescriptor = {
  id: "roo",
  name: "Roo Code",
  skills: { dir: ".roo/skills" },
  commands: { dir: ".roo/commands" },
  subagents: { dir: ".roomodes", isFile: true },
};

const cline: AgentDescriptor = {
  id: "cline",
  name: "Cline",
  skills: { dir: ".cline/skills" },
};

describe("scanAgentSubagentFiles", () => {
  it.effect("returns empty array for agent without subagents", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAgentSubagentFiles(cline, tempDir);
        expect(result).toEqual([]);
      }),
    ),
  );

  it.effect("returns empty array when directory is missing", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
        expect(result).toEqual([]);
      }),
    ),
  );

  it.effect("detects subagent files in a directory", () =>
    withNode(
      Effect.gen(function* () {
        const agentsDir = path.join(tempDir, ".claude", "agents");
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, "my-agent.md"), "# My Agent\nSome instructions");

        const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
        expect(result).toEqual([{ path: path.join(".claude/agents", "my-agent.md") }]);
      }),
    ),
  );

  it.effect("detects multiple files and skips subdirectories", () =>
    withNode(
      Effect.gen(function* () {
        const agentsDir = path.join(tempDir, ".claude", "agents");
        fs.mkdirSync(path.join(agentsDir, "nested"), { recursive: true });
        fs.writeFileSync(path.join(agentsDir, "one.md"), "# One");
        fs.writeFileSync(path.join(agentsDir, "two.md"), "# Two");

        const result = yield* scanAgentSubagentFiles(claudeCode, tempDir);
        const detected = result.map((file) => file.path).sort();
        expect(detected).toEqual([
          path.join(".claude/agents", "one.md"),
          path.join(".claude/agents", "two.md"),
        ]);
      }),
    ),
  );

  it.effect("detects .roomodes as a single file", () =>
    withNode(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, ".roomodes"), '{"customModes": []}');

        const result = yield* scanAgentSubagentFiles(roo, tempDir);
        expect(result).toEqual([{ path: ".roomodes" }]);
      }),
    ),
  );

  it.effect("returns empty array when .roomodes does not exist", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAgentSubagentFiles(roo, tempDir);
        expect(result).toEqual([]);
      }),
    ),
  );
});

describe("scanAllSubagentFiles", () => {
  it.effect("returns only agents with found subagent files", () =>
    withNode(
      Effect.gen(function* () {
        const agentsDir = path.join(tempDir, ".claude", "agents");
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, "agent.md"), "# Agent");

        const result = yield* scanAllSubagentFiles([claudeCode, roo, cline], tempDir);
        expect(result).toHaveLength(1);
        expect(result[0]?.agentId).toBe("claude-code");
        expect(result[0]?.files).toEqual([{ path: path.join(".claude/agents", "agent.md") }]);
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
        const agentsDir = path.join(tempDir, ".claude", "agents");
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, "agent.md"), "# Agent");
        fs.writeFileSync(path.join(tempDir, ".roomodes"), '{"customModes": []}');

        const result = yield* scanAllSubagentFiles([claudeCode, roo], tempDir);
        expect(result).toHaveLength(2);
        const ids = result.map((summary) => summary.agentId);
        expect(ids).toContain("claude-code");
        expect(ids).toContain("roo");
      }),
    ),
  );
});

/**
 * Tests for subagent file detection in agent directories.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { SubagentScanFailed } from "../errors.js";
import { scanAgentSubagentFiles, scanAllSubagentFiles } from "./subagents.js";
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

describe("scanAgentSubagentFiles", () => {
  it.effect("returns empty array for agent without subagents", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAgentSubagentFiles("cline", tempDir);
        expect(result).toEqual([]);
      }),
    ),
  );

  it.effect("returns empty array when directory is missing", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAgentSubagentFiles("claude-code", tempDir);
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

        const result = yield* scanAgentSubagentFiles("claude-code", tempDir);
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

        const result = yield* scanAgentSubagentFiles("claude-code", tempDir);
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

        const result = yield* scanAgentSubagentFiles("roo", tempDir);
        expect(result).toEqual([{ path: ".roomodes" }]);
      }),
    ),
  );

  it.effect("returns empty array when .roomodes does not exist", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAgentSubagentFiles("roo", tempDir);
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

        const result = yield* scanAllSubagentFiles(tempDir);
        expect(result).toHaveLength(1);
        expect(result[0]?.agentId).toBe("claude-code");
        expect(result[0]?.files).toEqual([{ path: path.join(".claude/agents", "agent.md") }]);
      }),
    ),
  );

  it.effect("returns empty array when no agents have subagent files", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* scanAllSubagentFiles(tempDir);
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

        const result = yield* scanAllSubagentFiles(tempDir);
        expect(result).toHaveLength(2);
        const ids = result.map((summary) => summary.agentId);
        expect(ids).toContain("claude-code");
        expect(ids).toContain("roo");
      }),
    ),
  );
});

describe("scanAllSubagentFiles over directories shared by several agents", () => {
  const setUpSharedDirectories = () => {
    fs.mkdirSync(path.join(tempDir, ".agents", "agents"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".agents", "agents", "a.md"), "# A");
    fs.writeFileSync(path.join(tempDir, ".agents", "agents", "b.md"), "# B");
    fs.mkdirSync(path.join(tempDir, ".qoder", "agents"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".qoder", "agents", "c.md"), "# C");
  };

  const recorded = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | FileSystemRecorder>,
    base: Layer.Layer<FileSystem.FileSystem> = NodeFileSystem.layer,
  ) => effect.pipe(Effect.provide(Layer.merge(layerRecordingFileSystem(base), NodePath.layer)));

  it.effect("scans each shared directory once and gives every agent its own rows", () =>
    recorded(
      Effect.gen(function* () {
        setUpSharedDirectories();
        const recording = yield* FileSystemRecorder;
        recording.reset();

        const result = yield* scanAllSubagentFiles(tempDir);

        const agentsDir = path.resolve(tempDir, ".agents/agents");
        const qoderDir = path.resolve(tempDir, ".qoder/agents");
        expect(recording.counts(agentsDir)).toEqual({ access: 1, readDirectory: 1 });
        expect(recording.counts(path.join(agentsDir, "a.md"))).toEqual({ stat: 1 });
        expect(recording.counts(path.join(agentsDir, "b.md"))).toEqual({ stat: 1 });
        expect(recording.counts(qoderDir)).toEqual({ access: 1, readDirectory: 1 });
        expect(recording.counts(path.join(qoderDir, "c.md"))).toEqual({ stat: 1 });

        const shared = [path.join(".agents/agents", "a.md"), path.join(".agents/agents", "b.md")];
        const qoder = [path.join(".qoder/agents", "c.md")];
        expect(
          result.map((summary) => ({
            agentId: summary.agentId,
            subagentDir: summary.subagentDir,
            files: summary.files.map((file) => file.path).sort(),
          })),
        ).toEqual([
          { agentId: "antigravity", subagentDir: ".agents/agents", files: shared },
          { agentId: "antigravity-cli", subagentDir: ".agents/agents", files: shared },
          { agentId: "goose", subagentDir: ".agents/agents", files: shared },
          { agentId: "qoder", subagentDir: ".qoder/agents", files: qoder },
          { agentId: "qoder-cn", subagentDir: ".qoder/agents", files: qoder },
        ]);
        const fileArrays = result.map((summary) => summary.files);
        expect(new Set(fileArrays).size).toBe(fileArrays.length);
      }),
    ),
  );

  it.effect("scans a shared directory again in a later call and sees its new entries", () =>
    recorded(
      Effect.gen(function* () {
        setUpSharedDirectories();
        const recording = yield* FileSystemRecorder;
        const agentsDir = path.resolve(tempDir, ".agents/agents");
        yield* scanAllSubagentFiles(tempDir);
        recording.reset();
        fs.writeFileSync(path.join(agentsDir, "d.md"), "# D");

        const result = yield* scanAllSubagentFiles(tempDir);

        expect(recording.counts(agentsDir)).toEqual({ access: 1, readDirectory: 1 });
        expect(recording.counts(path.join(agentsDir, "d.md"))).toEqual({ stat: 1 });
        const shared = ["a.md", "b.md", "d.md"].map((name) => path.join(".agents/agents", name));
        expect(
          result
            .filter((summary) => summary.subagentDir === ".agents/agents")
            .map((summary) => ({
              agentId: summary.agentId,
              files: summary.files.map((file) => file.path).sort(),
            })),
        ).toEqual([
          { agentId: "antigravity", files: shared },
          { agentId: "antigravity-cli", files: shared },
          { agentId: "goose", files: shared },
        ]);
      }),
    ),
  );

  it.effect("attributes a failed shared scan to the first agent that declares it", () => {
    const agentsDir = path.resolve(tempDir, ".agents/agents");
    const injected = PlatformError.systemError({
      _tag: "PermissionDenied",
      module: "FileSystem",
      method: "readDirectory",
      pathOrDescriptor: agentsDir,
    });
    const failingBase = Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const base = yield* FileSystem.FileSystem;
        return FileSystem.make({
          ...base,
          readDirectory: (directory, options) =>
            directory === agentsDir
              ? Effect.fail(injected)
              : base.readDirectory(directory, options),
        });
      }),
    ).pipe(Layer.provide(NodeFileSystem.layer));
    return recorded(
      Effect.gen(function* () {
        setUpSharedDirectories();
        const recording = yield* FileSystemRecorder;
        recording.reset();

        const error = yield* Effect.flip(scanAllSubagentFiles(tempDir));

        expect(error).toBeInstanceOf(SubagentScanFailed);
        expect(error.agentName).toBe("Antigravity");
        expect(error.cause).toBe(injected);
        expect(recording.counts(agentsDir).readDirectory).toBe(1);
      }),
      failingBase,
    );
  });
});

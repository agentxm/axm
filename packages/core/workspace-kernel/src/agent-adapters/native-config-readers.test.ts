import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { preflightNativeConfigReaders } from "./native-config-readers.js";

describe("physical native config reader compatibility", () => {
  it.effect("shares one preflight observation and refreshes it after an alias retarget", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".mcp.json");
      const alias = path.join(root, ".gemini/settings.json");
      yield* fs.makeDirectory(path.dirname(alias));
      yield* fs.writeFileString(file, "{}\n");
      yield* fs.writeFileString(path.join(root, "separate.json"), "{}\n");
      yield* fs.symlink("../separate.json", alias);
      const reads = new Map<string, number>();
      const preflight = preflightNativeConfigReaders({
        workspaceRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        scope: "project",
        physicalPath: file,
        configuredAgentIds: ["claude-code", "gemini-cli"],
        writerFormat: "json",
        raw: "{}\n",
        proposedRaw: JSON.stringify({
          mcpServers: { remote: { type: "http", url: "https://example.test/mcp" } },
        }),
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          readDirectory: (target, options) =>
            Effect.suspend(() => {
              reads.set(target, (reads.get(target) ?? 0) + 1);
              return fs.readDirectory(target, options);
            }),
        }),
      );
      const first = yield* preflight;
      expect(first.some(({ agentId }) => agentId === "gemini-cli")).toBe(false);
      expect(reads.get(root)).toBe(1);
      expect([...reads.values()].every((count) => count === 1)).toBe(true);
      yield* fs.remove(alias);
      yield* fs.symlink("../.mcp.json", alias);
      reads.clear();
      const changed = yield* preflight.pipe(Effect.result);
      expect(changed).toMatchObject({ _tag: "Failure", failure: { _tag: "McpConfigInvalid" } });
      expect(reads.get(root)).toBe(1);
      expect([...reads.values()].every((count) => count === 1)).toBe(true);
      expect(yield* fs.readFileString(file)).toBe("{}\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each([false, true])(
    "only a configured aliased MCP reader constrains an entry: %s",
    (configured) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, ".mcp.json");
        yield* fs.writeFileString(file, "{}\n");
        yield* fs.makeDirectory(path.join(root, ".gemini"));
        yield* fs.symlink("../.mcp.json", path.join(root, ".gemini/settings.json"));
        const args = {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          scope: "project" as const,
          physicalPath: file,
          configuredAgentIds: configured ? ["claude-code", "gemini-cli"] : ["claude-code"],
          writerFormat: "json" as const,
          raw: "{}\n",
        };
        const compatible = yield* preflightNativeConfigReaders({
          ...args,
          proposedRaw: JSON.stringify({
            mcpServers: { local: { type: "stdio", command: "node", args: ["server.js"] } },
          }),
        });
        expect(
          compatible.some(
            (reader) => reader.agentId === "gemini-cli" && reader.configured === configured,
          ),
        ).toBe(true);
        const incompatible = yield* preflightNativeConfigReaders({
          ...args,
          proposedRaw: JSON.stringify({
            mcpServers: { remote: { type: "http", url: "https://example.test/mcp" } },
          }),
        }).pipe(Effect.result);
        expect(incompatible._tag).toBe(configured ? "Failure" : "Success");
        expect(yield* fs.readFileString(file)).toBe("{}\n");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves opaque unchanged MCP values when another config unit changes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".mcp.json");
      const raw = JSON.stringify({
        mcpServers: { foreign: { futureNativeProtocol: { opaque: true } } },
        theme: "light",
      });
      yield* fs.writeFileString(file, raw);
      const readers = yield* preflightNativeConfigReaders({
        workspaceRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        scope: "project",
        physicalPath: file,
        configuredAgentIds: ["claude-code"],
        writerFormat: "json",
        raw,
        proposedRaw: JSON.stringify({
          mcpServers: { foreign: { futureNativeProtocol: { opaque: true } } },
          theme: "dark",
        }),
      });
      expect(readers.some(({ agentId }) => agentId === "claude-code")).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect.each([false, true])(
    "only a configured aliased Hook reader constrains an event: %s",
    (configured) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, ".claude/settings.json");
        yield* fs.makeDirectory(path.dirname(file));
        yield* fs.makeDirectory(path.join(root, ".gemini"));
        yield* fs.writeFileString(file, "{}\n");
        yield* fs.symlink("../.claude/settings.json", path.join(root, ".gemini/settings.json"));
        const result = yield* preflightNativeConfigReaders({
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          scope: "project",
          physicalPath: file,
          configuredAgentIds: configured ? ["claude-code", "gemini-cli"] : ["claude-code"],
          writerFormat: "json",
          raw: "{}\n",
          proposedRaw: JSON.stringify({
            hooks: {
              PreToolUse: [
                { matcher: "Write", hooks: [{ type: "command", command: "echo audit" }] },
              ],
            },
          }),
        }).pipe(Effect.result);
        expect(result._tag).toBe(configured ? "Failure" : "Success");
        expect(yield* fs.readFileString(file)).toBe("{}\n");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

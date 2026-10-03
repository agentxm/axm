import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import {
  buildAxmMcpMetadataFromSettingsSource,
  pruneManagedMcpServersForAgents,
  removeMcpServerFromAgents,
  syncInlineMcpServerToAgents,
} from "../../agent-adapters/index.js";
import { makeRecordingNativeWriteAuthority } from "../../agent-adapters/testing.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import { NativeWriteAuthorityLive } from "../live.js";

export const specification = defineSpecification({
  requirement: "workspace/mcps/removes-shared-native-containers-once",
  title: "MCP withdrawal groups physical consumers before any native mutation",
  statement:
    "AXM shall preflight all co-reader native container contracts before withdrawing MCP entries, mutate each shared physical file once, and preserve alias routes and exact eligible insertion baselines.",
  class: "functional",
  role: "supporting",
  goals: ["agent-interoperability", "workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real native config files and links reveal duplicate publication and incomplete preflight.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const expected = (...names: ReadonlyArray<string>) =>
  Object.fromEntries(
    names.map((name) => [name, [buildAxmMcpMetadataFromSettingsSource("inline", name)]]),
  );

const managed = (name: string) => ({
  command: "node",
  "x-axm": { v: 1, managed: true, ext: `@workspace/mcps/${name}`, source: "inline" },
});

describe("shared native MCP withdrawal", () => {
  it.effect("preflights a later malformed container before touching an earlier valid one", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const first = path.join(root, ".mcp.json");
      const second = path.join(root, ".cursor/mcp.json");
      yield* fs.makeDirectory(path.dirname(second));
      const before = JSON.stringify({ mcpServers: { old: managed("old") } });
      yield* fs.writeFileString(first, before);
      yield* fs.writeFileString(second, "{broken");
      const authority = yield* makeRecordingNativeWriteAuthority;
      const result = yield* removeMcpServerFromAgents(["claude-code", "cursor"], {
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        expectedManagedEntries: expected("old"),
        workspaceRoot: root,
        serverName: "old",
      }).pipe(Effect.provide(authority.layer), Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(first)).toBe(before);
      expect(yield* fs.readFileString(second)).toBe("{broken");
      expect((yield* authority.observed).records).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses an incompatible Hook co-reader before changing the MCP container", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".codex/config.toml");
      const alias = path.join(root, ".claude/settings.json");
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.makeDirectory(path.dirname(alias), { recursive: true });
      yield* fs.writeFileString(file, "");
      yield* fs.symlink("../.codex/config.toml", alias);
      const authority = yield* makeRecordingNativeWriteAuthority;
      const result = yield* syncInlineMcpServerToAgents(["codex", "claude-code"], {
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        workspaceRoot: root,
        serverName: "review",
        nativeInsertionEligible: true,
        entry: {
          kind: "inline",
          connection: { transport: "stdio", command: "node", env: {} },
          enabled: true,
        },
      }).pipe(Effect.provide(authority.layer), Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(file)).toBe("");
      expect(yield* fs.exists(path.join(root, ".mcp.json"))).toBe(false);
      expect(yield* fs.readLink(alias)).toBe("../.codex/config.toml");
      expect((yield* authority.observed).records).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("prunes two stale keys from two aliased readers with one native publication", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".mcp.json");
      const alias = path.join(root, ".cursor/mcp.json");
      yield* fs.makeDirectory(path.dirname(alias));
      yield* fs.writeFileString(
        file,
        JSON.stringify({
          mcpServers: { first: managed("first"), second: managed("second") },
          foreign: true,
        }),
      );
      yield* fs.symlink("../.mcp.json", alias);
      const authority = yield* makeRecordingNativeWriteAuthority;
      const outcomes = yield* pruneManagedMcpServersForAgents(["claude-code", "cursor"], {
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        expectedManagedEntries: expected("first", "second"),
        workspaceRoot: root,
        declaredServerNames: new Set(),
      }).pipe(Effect.provide(authority.layer));
      expect(outcomes.map((outcome) => outcome._tag)).toEqual(["success", "success"]);
      expect((yield* authority.observed).records).toHaveLength(1);
      expect(JSON.parse(yield* fs.readFileString(file))).toEqual({ mcpServers: {}, foreign: true });
      expect(yield* fs.readLink(alias)).toBe("../.mcp.json");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "retains a foreign accepted-source marker while pruning an exactly accepted neighbor",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, ".mcp.json");
        const foreign = {
          command: "node",
          "x-axm": {
            v: 1,
            managed: true,
            ext: "@other/mcps/foreign",
            source: "registry",
            ref: "@other/mcps/foreign",
          },
        };
        yield* fs.writeFileString(
          file,
          JSON.stringify({ mcpServers: { owned: managed("owned"), foreign } }),
        );
        const authority = yield* makeRecordingNativeWriteAuthority;
        const outcomes = yield* pruneManagedMcpServersForAgents(["claude-code"], {
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          workspaceRoot: root,
          declaredServerNames: new Set(),
          expectedManagedEntries: expected("owned", "foreign"),
        }).pipe(Effect.provide(authority.layer));
        expect(JSON.parse(yield* fs.readFileString(file))).toEqual({ mcpServers: { foreign } });
        expect((yield* authority.observed).records).toHaveLength(1);
        expect(outcomes).toMatchObject([
          {
            _tag: "success",
            targets: [
              {
                change: "unchanged",
                nativeLocation: {
                  ownership: "unowned",
                  state: "retained",
                  address: { keys: ["mcpServers", "foreign"] },
                },
              },
              { nativeLocation: { ownership: "owned", state: "removed" } },
            ],
          },
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("uses the complete shared alias route to restore an eligible compact baseline", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".mcp.json");
      const alias = path.join(root, ".cursor/mcp.json");
      yield* fs.makeDirectory(path.dirname(alias));
      yield* fs.writeFileString(file, "{ }");
      yield* fs.symlink("../.mcp.json", alias);
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(
          Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
        ),
      );
      yield* Effect.gen(function* () {
        yield* syncInlineMcpServerToAgents(["claude-code", "cursor"], {
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          nativeInsertionEligible: true,
          workspaceRoot: root,
          serverName: "one",
          entry: {
            kind: "inline",
            connection: { transport: "stdio", command: "node", env: {} },
            enabled: true,
          },
        });
        yield* removeMcpServerFromAgents(["claude-code", "cursor"], {
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          expectedManagedEntries: expected("one"),
          workspaceRoot: root,
          serverName: "one",
        });
        expect(yield* fs.readFileString(file)).toBe("{ }");
        expect(yield* fs.readLink(alias)).toBe("../.mcp.json");
        expect(yield* fs.exists(path.join(root, ".axm/projection-containers.json"))).toBe(false);
      }).pipe(Effect.provide(authority));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

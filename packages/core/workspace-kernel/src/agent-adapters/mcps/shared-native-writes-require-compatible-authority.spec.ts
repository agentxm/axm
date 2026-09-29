import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  newlyConfiguredMcpRoutePaths,
  configuredMcpCapability,
  declaredMcpWriterTargets,
  resolveSharedMcpTarget,
  syncInlineMcpServerToAgents,
  removeAgentMcpConfig,
  decodeJsonMcpConfig,
  type AxmMcpMetadata,
  validateAgentMcpConfigWrite,
  writeAgentMcpConfig,
} from "../index.js";
import { makeRecordingNativeWriteAuthority } from "../testing.js";

export const specification = defineSpecification({
  requirement: "workspace/mcps/shared-native-writes-require-compatible-authority",
  title: "Shared MCP writes require compatible readers and proven authority",
  statement:
    "AXM shall write each physical MCP file once only when its complete format, declared servers-container path, and rendered entry satisfy all declared native readers and the target entry is absent, proven owned, or explicitly adopted from an unchanged observed declaration; alias escapes and stale adoption shall leave native files unchanged.",
  class: "functional",
  role: "supporting",
  goals: ["agent-interoperability", "workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Temporary native files and symbolic links expose physical sharing, unowned entries, and stale adoption.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/mcps/projects-to-every-configured-agent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const managedEntry = {
  command: "node",
  "x-axm": { v: 1, managed: true, ext: "@workspace/mcps/context", source: "inline" },
};

const acceptedOwner = {
  v: 1,
  managed: true,
  ext: "@workspace/mcps/context",
  source: "inline",
} satisfies AxmMcpMetadata;

describe("authority at shared MCP files", () => {
  it.effect.each(["project", "user"] as const)(
    "projects OpenCode secrets into the exact nested %s destination and preserves sibling settings",
    (scope) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const xdg = yield* fs.makeTempDirectoryScoped();
        const file =
          scope === "project"
            ? path.join(root, "opencode.json")
            : path.join(xdg, "opencode/opencode.json");
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        const foreign = { type: "local", command: ["foreign"], disabled: true };
        yield* fs.writeFileString(
          file,
          JSON.stringify({
            mcp: { timeout: { startup: 45000 }, servers: { foreign } },
            model: "foreign-model",
          }),
        );
        const authority = yield* makeRecordingNativeWriteAuthority;
        yield* Effect.gen(function* () {
          const targets = yield* syncInlineMcpServerToAgents(["opencode"], {
            workspaceRoot: root,
            nativeDirectoryInputs: { skillsDirectoryOverrides: {}, xdgConfigRoot: xdg },
            scope,
            serverName: "context",
            nativeInsertionEligible: true,
            entry: {
              kind: "inline",
              url: "https://example.test/mcp",
              headers: { Authorization: "Bearer ${TOKEN}", "X-Secondary": "${SECOND}" },
              env: {},
              enabled: false,
            },
          });
          expect(targets).toHaveLength(1);
          expect(targets[0]).toMatchObject({ _tag: "success" });
          expect(targets[0]?.targets?.[0]?.nativeLocation?.address).toEqual({
            kind: "key-path",
            path: file,
            keys: ["mcp", "servers", "context"],
          });
          const raw = yield* fs.readFileString(file);
          const document = (yield* decodeJsonMcpConfig(file, raw, ["mcp", "servers"], "json")).root;
          expect(document).toMatchObject({
            model: "foreign-model",
            mcp: {
              timeout: { startup: 45000 },
              servers: {
                foreign,
                context: {
                  type: "remote",
                  disabled: true,
                  headers: { Authorization: "Bearer {env:TOKEN}", "X-Secondary": "{env:SECOND}" },
                  "x-axm": acceptedOwner,
                },
              },
            },
          });
        }).pipe(Effect.provide(authority.layer));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each(['{"mcp":null}', '{"mcp":[]}', '{"mcp":{"servers":42}}'])(
    "refuses occupied nested containers without mutations: %s",
    (raw) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "native.json");
        yield* fs.writeFileString(file, raw);
        const authority = yield* makeRecordingNativeWriteAuthority;
        const result = yield* writeAgentMcpConfig({
          workspaceRoot: root,
          serverName: "context",
          serversPath: ["mcp", "servers"],
          entry: managedEntry,
          nativeInsertionEligible: true,
          target: { scope: "project", path: "native.json", format: "json", attribution: "agent" },
        }).pipe(Effect.result, Effect.provide(authority.layer));
        expect(result._tag).toBe("Failure");
        expect(yield* fs.readFileString(file)).toBe(raw);
        expect((yield* authority.observed).records).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a YAML insertion that would also mutate an unrelated alias", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const raw = "mcpServers: &shared {}\nforeign: *shared\n";
      const file = path.join(root, "native.yaml");
      yield* fs.writeFileString(file, raw);
      const authority = yield* makeRecordingNativeWriteAuthority;
      const result = yield* writeAgentMcpConfig({
        workspaceRoot: root,
        serverName: "context",
        serversPath: ["mcpServers"] as const,
        entry: managedEntry,
        nativeInsertionEligible: true,
        target: { scope: "project", path: "native.yaml", format: "yaml", attribution: "agent" },
      }).pipe(Effect.provide(authority.layer), Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure._tag).toBe("McpConfigInvalid");
      expect(yield* fs.readFileString(file)).toBe(raw);
      expect((yield* authority.observed).records).toHaveLength(0);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "requires the accepted owner for removal and explicit previous owner for replacement",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const target = {
          scope: "project",
          path: "native.json",
          format: "json",
          attribution: "agent",
        } as const;
        const file = path.join(root, target.path);
        const raw = JSON.stringify({ mcpServers: { context: managedEntry }, foreign: true });
        yield* fs.writeFileString(file, raw);
        const nextOwner = {
          v: 1,
          managed: true,
          ext: "@someone/mcps/replacement",
          source: "registry",
          ref: "@someone/mcps/replacement",
        } satisfies AxmMcpMetadata;
        const authority = yield* makeRecordingNativeWriteAuthority;
        yield* Effect.gen(function* () {
          const refused = yield* removeAgentMcpConfig({
            workspaceRoot: root,
            target,
            serverName: "context",
            serversPath: ["mcpServers"] as const,
            disableOnly: false,
            activationField: { required: null, accepted: [null] },
            expectedManagedEntries: { context: [nextOwner] },
          }).pipe(Effect.result);
          expect(refused._tag).toBe("Failure");
          expect(yield* fs.readFileString(file)).toBe(raw);
          const replacement = {
            workspaceRoot: root,
            target,
            serverName: "context",
            serversPath: ["mcpServers"] as const,
            nativeInsertionEligible: false,
            entry: { command: "replacement", "x-axm": nextOwner },
          } as const;
          expect((yield* writeAgentMcpConfig(replacement).pipe(Effect.result))._tag).toBe(
            "Failure",
          );
          expect(yield* fs.readFileString(file)).toBe(raw);
          const result = yield* writeAgentMcpConfig({
            ...replacement,
            previousManagedEntries: [acceptedOwner],
          });
          expect(result.targets[0]?.nativeLocation?.state).toBe("updated");
          const rewritten = yield* fs.readFileString(file);
          expect(rewritten).toContain('"foreign":true');
          expect(rewritten).toContain("@someone/mcps/replacement");
        }).pipe(Effect.provide(authority.layer));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reports unchanged owned units and distinguishes a new key from its existing file",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const target = {
          scope: "project",
          path: "native.json",
          format: "json",
          attribution: "agent",
        } as const;
        yield* fs.writeFileString(path.join(root, target.path), "{}");
        const authority = yield* makeRecordingNativeWriteAuthority;
        yield* Effect.gen(function* () {
          const args = {
            workspaceRoot: root,
            target,
            serverName: "context",
            serversPath: ["mcpServers"] as const,
            entry: managedEntry,
            nativeInsertionEligible: false,
          } as const;
          const inserted = yield* writeAgentMcpConfig(args);
          expect(inserted.targets[0]?.change).toBe("updated");
          expect(inserted.targets[0]?.nativeLocation?.state).toBe("created");
          const repeated = yield* writeAgentMcpConfig(args);
          expect(repeated.targets[0]?.change).toBe("unchanged");
          expect(repeated.targets[0]?.nativeLocation?.address).toEqual({
            kind: "key-path",
            path: path.join(root, target.path),
            keys: ["mcpServers", "context"],
          });
          expect(repeated.targets[0]?.nativeLocation?.state).toBe("unchanged");
          expect((yield* authority.observed).records).toHaveLength(1);
        }).pipe(Effect.provide(authority.layer));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const row of [
    { format: "json", raw: '{"mcpServers":{"context":{"command":"foreign"}}}' },
    { format: "jsonc", raw: '{\n// keep\n"mcpServers":{"context":null}}' },
    { format: "yaml", raw: "# keep\nmcpServers:\n  context:\n    command: foreign\n" },
    { format: "toml", raw: '[mcpServers.context]\ncommand = "foreign"\n' },
  ] as const) {
    it.effect(`preserves an occupied unowned ${row.format} entry`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "native");
        yield* fs.writeFileString(file, row.raw);
        const authority = yield* makeRecordingNativeWriteAuthority;
        const result = yield* writeAgentMcpConfig({
          nativeInsertionEligible: false,
          workspaceRoot: root,
          serverName: "context",
          serversPath: ["mcpServers"] as const,
          target: { scope: "project", path: "native", format: row.format, attribution: "agent" },
          entry: managedEntry,
        }).pipe(Effect.provide(authority.layer), Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure._tag).toBe("McpEntryUnmanaged");
        expect(yield* fs.readFileString(file)).toBe(row.raw);
        expect((yield* authority.observed).records).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("adopts only the exact observed declaration and preserves siblings", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      const authority = yield* makeRecordingNativeWriteAuthority;
      const expectedEntry = { command: "node" };
      const write = writeAgentMcpConfig({
        nativeInsertionEligible: false,
        workspaceRoot: root,
        serverName: "context",
        serversPath: ["mcpServers"] as const,
        target: { scope: "project", path: "native.json", format: "json", attribution: "agent" },
        entry: managedEntry,
        adoption: { filePath: file, expectedEntry },
      });
      const changed = '{"mcpServers":{"context":{"command":"changed"}},"foreign":true}';
      yield* fs.writeFileString(file, changed);
      expect((yield* write.pipe(Effect.provide(authority.layer), Effect.result))._tag).toBe(
        "Failure",
      );
      expect(yield* fs.readFileString(file)).toBe(changed);
      yield* fs.writeFileString(
        file,
        '{"mcpServers":{"context":{"command":"node"}},"foreign":true}',
      );
      yield* write.pipe(Effect.provide(authority.layer));
      expect(yield* fs.readFileString(file)).toContain('"foreign":true');
      expect((yield* authority.observed).records).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("writes aliased Claude and Cursor configuration once", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, ".cursor"));
      yield* fs.writeFileString(path.join(root, ".mcp.json"), "{}\n");
      yield* fs.symlink("../.mcp.json", path.join(root, ".cursor/mcp.json"));
      const authority = yield* makeRecordingNativeWriteAuthority;
      const outcomes = yield* syncInlineMcpServerToAgents(["claude-code", "cursor"], {
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        nativeInsertionEligible: false,
        workspaceRoot: root,
        serverName: "context",
        entry: { kind: "inline", command: "node", env: {}, enabled: true },
      }).pipe(Effect.provide(authority.layer));
      expect(outcomes.map((outcome) => outcome._tag)).toEqual(["success", "success"]);
      expect((yield* authority.observed).records).toHaveLength(1);
      expect(yield* fs.readLink(path.join(root, ".cursor/mcp.json"))).toBe("../.mcp.json");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses JSONC comments when one co-reader requires strict JSON", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const capability = configuredMcpCapability("claude-code");
      const config =
        capability === undefined ? undefined : declaredMcpWriterTargets(capability)[0]?.config;
      if (config === undefined) return expect.fail("Expected Claude MCP configuration");
      const resolution = resolveSharedMcpTarget({
        transport: "stdio",
        members: [
          {
            agentId: "first-jsonc",
            locationId: "project",
            configured: true,
            config,
            target: {
              path: "native.json",
              scope: "project",
              format: "jsonc",
              attribution: "agent",
            },
          },
          {
            agentId: "second-json",
            locationId: "project",
            configured: true,
            config,
            target: { path: "native.json", scope: "project", format: "json", attribution: "agent" },
          },
        ],
      });
      if (resolution._tag !== "resolved") return expect.fail("Expected common strict JSON grammar");
      expect(resolution.target.format).toBe("json");
      const raw = '{\n// user comment\n"mcpServers":{},"foreign":true\n}';
      const file = path.join(root, "native.json");
      yield* fs.writeFileString(file, raw);
      const result = yield* validateAgentMcpConfigWrite({
        nativeInsertionEligible: false,
        workspaceRoot: root,
        serverName: "context",
        serversPath: ["mcpServers"] as const,
        target: resolution.target,
        entry: managedEntry,
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(file)).toBe(raw);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a leaf alias outside the selected workspace", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const outside = yield* fs.makeTempDirectoryScoped();
      const file = path.join(outside, "native.json");
      yield* fs.writeFileString(file, "{}\n");
      yield* fs.symlink(file, path.join(root, "alias.json"));
      const result = yield* validateAgentMcpConfigWrite({
        nativeInsertionEligible: false,
        workspaceRoot: root,
        serverName: "context",
        serversPath: ["mcpServers"] as const,
        target: { scope: "project", path: "alias.json", format: "json", attribution: "agent" },
        entry: managedEntry,
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(file)).toBe("{}\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  for (const entry of [
    { kind: "inline", command: "node", env: { TOKEN: "${TOKEN}" }, enabled: true },
    {
      kind: "inline",
      url: "https://mcp.example.test/mcp",
      headers: { Authorization: "Bearer ${TOKEN}" },
      env: {},
      enabled: true,
    },
  ] as const) {
    it.effect(
      `shares ordinary references with all native ${"command" in entry ? "stdio" : "HTTP"} readers`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const authority = yield* makeRecordingNativeWriteAuthority;
          const outcomes = yield* syncInlineMcpServerToAgents(
            ["claude-code", "github-copilot-cli"],
            {
              workspaceRoot: root,
              nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
              serverName: "context",
              nativeInsertionEligible: true,
              entry,
            },
          ).pipe(Effect.provide(authority.layer));
          expect(outcomes.map((outcome) => outcome._tag)).toEqual(["success", "success"]);
          expect((yield* authority.observed).records).toHaveLength(1);
          const native = yield* fs.readFileString(path.join(root, ".mcp.json"));
          expect(native).toContain("${TOKEN}");
          expect(native).toContain('"x-axm"');
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect(
    "refuses default references an unconfigured co-reader would interpret differently",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const authority = yield* makeRecordingNativeWriteAuthority;
        const result = yield* syncInlineMcpServerToAgents(["claude-code"], {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          serverName: "context",
          nativeInsertionEligible: true,
          entry: {
            kind: "inline",
            command: "node",
            env: { TOKEN: "${TOKEN:-fallback}" },
            enabled: true,
          },
        }).pipe(Effect.result, Effect.provide(authority.layer));
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure).toMatchObject({
            _tag: "McpSharedTargetConflict",
            reason: expect.stringContaining("github-copilot-cli"),
          });
        expect((yield* authority.observed).records).toEqual([]);
        expect(yield* fs.exists(path.join(root, ".mcp.json"))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("new membership authorizes only newly reached physical files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const args = {
        workspaceRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        scope: "project" as const,
        previousAgentIds: ["claude-code"],
        agentIds: ["claude-code", "cursor"],
      };
      expect([...(yield* newlyConfiguredMcpRoutePaths(args))]).toEqual([
        path.join(root, ".cursor/mcp.json"),
      ]);
      yield* fs.makeDirectory(path.join(root, ".cursor"));
      yield* fs.writeFileString(path.join(root, ".mcp.json"), "{}");
      yield* fs.symlink("../.mcp.json", path.join(root, ".cursor/mcp.json"));
      expect([...(yield* newlyConfiguredMcpRoutePaths(args))]).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

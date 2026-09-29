import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import {
  removeAgentMcpConfig,
  writeAgentMcpConfig,
  type AxmMcpMetadata,
} from "../../agent-adapters/index.js";
import { NativeWriteAuthorityLive } from "../live.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceLocation } from "../../workspace-state/index.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";

export const specification = defineSpecification({
  requirement: "workspace/mcps/withdraws-eligible-native-insertions-exactly",
  title: "Withdrawing a newly inserted MCP entry restores its exact native baseline",
  statement:
    "When a new MCP entry is inserted into a native location and precisely that entry is withdrawn without intervening intent, source, or foreign changes, AXM shall restore the original file bytes or original absence and retire only its proven empty created parents; a formatting change for which AXM cannot preserve the foreign baseline shall be refused before mutation.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Native formats and filesystem identity are observed through real temporary files and the live receipt authority.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const entry = {
  command: "node",
  "x-axm": {
    v: 1,
    managed: true,
    ext: "@workspace/mcps/context",
    source: "inline",
  } satisfies AxmMcpMetadata,
};
const authorityLayer = (root: string) =>
  NativeWriteAuthorityLive.pipe(
    Layer.provide(Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive)),
  );

describe("eligible MCP native round trips", () => {
  it.effect("uses an explicit external XDG root while preserving foreign workspace authority", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const xdg = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(home, ".axm"));
      const selected = Layer.effect(
        WorkspaceLocation,
        Effect.map(WorkspaceLocation, (location) => ({
          ...location,
          scope: "user" as const,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {}, xdgConfigRoot: xdg },
        })),
      ).pipe(Layer.provide(WorkspaceReadTest({ baseDir: home })));
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(Layer.merge(selected, WorkspaceFileWriteLocksLive)),
      );
      yield* Effect.gen(function* () {
        const target = {
          scope: "user",
          nativeRoot: xdg,
          path: path.join(xdg, "agent/config.json"),
          format: "json",
          attribution: "agent",
        } as const;
        yield* writeAgentMcpConfig({
          nativeInsertionEligible: true,
          workspaceRoot: home,
          serverName: "context",
          serversPath: ["mcpServers"] as const,
          target,
          entry,
        });
        expect(yield* fs.exists(target.path)).toBe(true);
        yield* removeAgentMcpConfig({
          expectedManagedEntries: { context: [entry["x-axm"]] },
          workspaceRoot: home,
          serverName: "context",
          serversPath: ["mcpServers"] as const,
          target,
          disableOnly: false,
          activationField: { required: null, accepted: [null] },
        });
        expect(yield* fs.readDirectory(xdg)).toEqual([]);
        const foreign = path.join(xdg, "foreign");
        yield* fs.makeDirectory(foreign);
        yield* fs.writeFileString(path.join(foreign, "axm.json"), "{}\n");
        const refused = yield* writeAgentMcpConfig({
          nativeInsertionEligible: true,
          workspaceRoot: home,
          serverName: "context",
          serversPath: ["mcpServers"] as const,
          target: { ...target, path: path.join(foreign, "config.json") },
          entry,
        }).pipe(Effect.result);
        expect(refused._tag).toBe("Failure");
        expect(yield* fs.readDirectory(foreign)).toEqual(["axm.json"]);
      }).pipe(Effect.provide(authority));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const serversPath of [["mcpServers"], ["mcp", "servers"]] as const) {
    for (const row of [
      { label: "absent", format: "json", before: undefined },
      { label: "empty", format: "json", before: "" },
      { label: "compact", format: "json", before: '{"foreign":true}' },
      {
        label: "comments and CRLF",
        format: "jsonc",
        before: '{\r\n  // retain me\r\n  "foreign": true,\r\n  "mcpServers": {}\r\n}',
      },
      { label: "TOML no newline", format: "toml", before: 'foreign = "keep"' },
      { label: "YAML", format: "yaml", before: "# keep\nforeign: true\n" },
    ] as const) {
      it.effect(`restores ${row.label} exactly at ${serversPath.join(".")}`, () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          yield* fs.makeDirectory(path.join(root, ".axm"));
          const target = {
            scope: "project",
            path: "native/nested/config",
            format: row.format,
            attribution: "agent",
          } as const;
          const file = path.join(root, target.path);
          if (row.before !== undefined) {
            yield* fs.makeDirectory(path.dirname(file), { recursive: true });
            yield* fs.writeFileString(file, row.before);
          }
          yield* Effect.gen(function* () {
            yield* writeAgentMcpConfig({
              nativeInsertionEligible: true,
              workspaceRoot: root,
              serverName: "context",
              serversPath,
              target,
              entry,
            });
            const result = yield* removeAgentMcpConfig({
              expectedManagedEntries: { context: [entry["x-axm"]] },
              workspaceRoot: root,
              serverName: "context",
              serversPath,
              target,
              disableOnly: false,
              activationField: { required: null, accepted: [null] },
            });
            expect(result.targets).toHaveLength(1);
            if (row.before === undefined) {
              expect(yield* fs.exists(path.join(root, "native"))).toBe(false);
              expect(result.targets[0]?.change).toBe("removed");
            } else expect(yield* fs.readFileString(file)).toBe(row.before);
            expect(yield* fs.exists(path.join(root, ".axm/projection-containers.json"))).toBe(
              false,
            );
          }).pipe(Effect.provide(authorityLayer(root)));
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }
  }
});

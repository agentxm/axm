import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  writeAgentMcpConfig,
  removeAgentMcpConfig,
  readNativeMcpValues,
} from "../../agent-adapters/index.js";
import { makeRecordingNativeWriteAuthority } from "../../agent-adapters/testing.js";

export const specification = defineSpecification({
  requirement: "workspace/mcps/explicit-cleanup-preserves-unselected-state",
  title: "Explicit MCP cleanup preserves the native container and unselected state",
  statement:
    "Explicit MCP cleanup shall remove only the selected native key, preserve other values and the native file, and require no ownership receipt or historical insertion baseline. Removing intent alone shall not select a key for cleanup.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real native files expose complete-entry removal, retained containers, and receipt creation.",
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: ["workspace/mcps/withdraws-eligible-native-insertions-exactly"],
  assumptions: [],
  openQuestions: [],
});

describe("explicit MCP cleanup", () => {
  it.effect.each(["json", "jsonc", "toml", "yaml", "starlark", "vscode-settings"] as const)(
    "removes only the selected key in %s without historical ownership state",
    (format) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "native");
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          workspaceRoot: root,
          serverName: "selected",
          serversPath: ["mcpServers"] as const,
          target: { scope: "project" as const, path: file, format, attribution: "agent" as const },
        };
        yield* Effect.gen(function* () {
          yield* writeAgentMcpConfig({ ...args, serverName: "other", entry: { command: "keep" } });
          yield* writeAgentMcpConfig({
            ...args,
            entry: { command: "remove", env: { NESTED: "value" } },
          });
          const before = yield* fs.readFileString(file);
          const preview = yield* removeAgentMcpConfig({
            ...args,
            disableOnly: false,
            activationField: { required: null, accepted: [null] },
            dryRun: true,
          });
          expect(yield* fs.readFileString(file)).toBe(before);
          expect(preview.targets[0]?.nativeLocation).toMatchObject({
            state: "removed",
            ownership: "declared",
          });
          const result = yield* removeAgentMcpConfig({
            ...args,
            disableOnly: false,
            activationField: { required: null, accepted: [null] },
          });
          expect(result).toEqual(preview);
          expect(result.targets[0]?.nativeLocation).toMatchObject({
            ownership: "declared",
            proof: "effective-native-declaration",
            state: "removed",
          });
          expect(
            yield* readNativeMcpValues({
              configPath: file,
              raw: yield* fs.readFileString(file),
              format,
              serversPath: args.serversPath,
            }),
          ).toEqual({ other: { command: "keep" } });
          const unchanged = yield* fs.readFileString(file);
          const noChange = yield* removeAgentMcpConfig({
            ...args,
            disableOnly: false,
            activationField: { required: null, accepted: [null] },
            dryRun: true,
          });
          expect(noChange.targets).toEqual([]);
          expect(yield* fs.readFileString(file)).toBe(unchanged);
          expect(yield* fs.exists(path.join(root, ".axm/projection-containers.json"))).toBe(false);
        }).pipe(Effect.provide(authority.layer));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

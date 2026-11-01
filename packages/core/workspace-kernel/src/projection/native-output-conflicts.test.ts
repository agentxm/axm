import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { resolveNativeEntry } from "../locations/index.js";
import type { AgentOutputObservation } from "./agent-output-observation.js";
import { HookConfigInvalid, McpConfigInvalid } from "../agent-adapters/index.js";
import type { NativeConfigObservationDiagnostic } from "../agent-adapters/index.js";
import {
  classifyNativeOutputHealth,
  classifyNativeOutputCollisions,
} from "./native-output-conflicts.js";

const output = (path: string): AgentOutputObservation => ({
  path,
  containerPath: path.slice(0, path.lastIndexOf("/")),
  entryName: "axm",
  extensionType: "skill",
  ownership: "unowned",
  desired: false,
  claimantAgentIds: ["claude-code", "opencode", "crush"],
});

describe("native output concerns", () => {
  it("projects configuration diagnostics without exposing parser input or messages", () => {
    const secret = "opaque-native-setting-that-is-not-a-known-token-shape";
    const rawCause = { issue: { input: { env: { UNFAMILIAR_NATIVE_SETTING: secret } } } };
    const diagnostics: ReadonlyArray<NativeConfigObservationDiagnostic> = [
      {
        extensionType: "hook",
        address: { kind: "key-path", path: "/workspace/hooks.json", keys: ["hooks"] },
        aliases: ["/workspace/hooks.json"],
        claimantAgentIds: ["claude-code"],
        stage: "decode",
        cause: new HookConfigInvalid({ detail: secret, cause: rawCause }),
      },
      {
        extensionType: "mcp-server",
        address: { kind: "key-path", path: "/workspace/mcp.json", keys: ["mcpServers"] },
        aliases: ["/workspace/mcp.json"],
        claimantAgentIds: ["cursor"],
        stage: "decode",
        cause: new McpConfigInvalid({ detail: secret, cause: rawCause }),
      },
    ];
    const concerns = classifyNativeOutputHealth([], diagnostics);
    expect(concerns).toHaveLength(2);
    expect(
      concerns.every(
        (concern) => concern.kind === "unreadable" && concern.reason.includes("decode"),
      ),
    ).toBe(true);
    expect(concerns.map((concern) => concern.path)).toEqual([
      "/workspace/hooks.json",
      "/workspace/mcp.json",
    ]);
    expect(JSON.stringify(diagnostics)).toContain(secret);
    expect(JSON.stringify(concerns)).not.toContain(secret);
    expect(JSON.stringify(concerns)).not.toContain("cause");
  });
  it.effect("counts two dangling links once each and never treats them as collisions", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-link-health-" });
      const paths = [`${root}/one`, `${root}/two`];
      for (const path of paths) yield* fs.symlink("missing-target", path);
      const user = yield* Effect.forEach(paths, (path) =>
        Effect.gen(function* () {
          return {
            ...output(path),
            nativeEntry: yield* resolveNativeEntry(path).pipe(Effect.result),
          };
        }),
      );
      expect(classifyNativeOutputHealth([...user, ...user])).toEqual(
        paths.map((path) => ({ kind: "broken-link", path, target: "missing-target" })),
      );
      const project = [1, 2, 3, 4, 5].map((id) => output(`${root}/project-${id}`));
      expect(classifyNativeOutputCollisions(project, user, new Set(["claude-code"]))).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "keeps loops distinct from missing targets and restricts valid collisions to configured readers",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-link-health-" });
        const loop = `${root}/loop`;
        yield* fs.symlink("loop", loop);
        const brokenObservation = {
          ...output(loop),
          nativeEntry: yield* resolveNativeEntry(loop).pipe(Effect.result),
        };
        expect(classifyNativeOutputHealth([brokenObservation])).toEqual([
          { kind: "unreadable", path: loop, reason: "unreadable" },
        ]);
        const target = `${root}/target`;
        yield* fs.makeDirectory(target);
        const valid = {
          ...output(target),
          nativeEntry: yield* resolveNativeEntry(target).pipe(Effect.result),
        };
        expect(
          classifyNativeOutputCollisions(
            [output(`${root}/project`)],
            [valid, valid],
            new Set(["opencode", "claude-code"]),
          ),
        ).toEqual([
          {
            kind: "collision",
            path: `${root}/project`,
            otherPath: target,
            extensionType: "skill",
            entryName: "axm",
            agentIds: ["claude-code", "opencode"],
          },
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

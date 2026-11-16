/**
 * Work evidence for validating several inline MCP servers in order: the
 * servers share one resolution of their native targets and one read of each
 * target file, and every outcome equals validating each server on its own.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { McpServerDeclaration } from "./expected-entry.js";
import {
  validateInlineMcpServerTargets,
  validateInlineMcpServerTargetsInOrder,
  type InlineMcpServerCandidate,
} from "./sync.js";

const nativeDirectoryInputs = { skillsDirectoryOverrides: {} };

const remote = (url: string): McpServerDeclaration => ({
  kind: "inline",
  connection: { transport: "streamable-http", url },
  enabled: true,
});

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A real workspace directory, read through a recording filesystem, removed when the case ends. */
const withWorkspace = <A, E, R>(use: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-in-order-"))),
    use,
    (root) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  ).pipe(
    // The recording filesystem replaces the platform's own.
    Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeFileSystem.layer))),
  );

/** Validate each server on its own, as separate calls do. */
const oneAtATime = (
  agentIds: ReadonlyArray<string>,
  root: string,
  candidates: ReadonlyArray<InlineMcpServerCandidate>,
) =>
  Effect.forEach(candidates, (candidate) =>
    validateInlineMcpServerTargets(agentIds, {
      nativeDirectoryInputs,
      workspaceRoot: root,
      ...candidate,
    }).pipe(Effect.map((plan) => ({ serverName: candidate.serverName, plan }))),
  );

const inOrder = (
  agentIds: ReadonlyArray<string>,
  root: string,
  candidates: ReadonlyArray<InlineMcpServerCandidate>,
) =>
  validateInlineMcpServerTargetsInOrder(
    agentIds,
    { nativeDirectoryInputs, workspaceRoot: root },
    candidates,
  );

describe("inline MCP validation in server order", () => {
  it.effect("resolves the shared targets and reads their file once for every server", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(file, json({ mcpServers: { foreign: { command: "foreign-server" } } }));
        const candidates = [
          { serverName: "alpha", entry: remote("https://mcp.example.test/alpha") },
          { serverName: "beta", entry: remote("https://mcp.example.test/beta") },
        ];

        recording.reset();
        const separate = yield* oneAtATime(["claude-code"], root, candidates);
        const separateReads = recording.contentReads(file);

        recording.reset();
        const shared = yield* inOrder(["claude-code"], root, candidates);
        const sharedReads = recording.contentReads(file);

        expect(shared).toEqual(separate);
        expect(shared.map(({ plan }) => plan.writes.map((write) => write.path))).toEqual([
          [file],
          [file],
        ]);
        expect({ separateReads, sharedReads }).toEqual({ separateReads: 4, sharedReads: 2 });
      }),
    ),
  );

  it.effect("stops at a later server's refusal with the refusal it has on its own", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        mkdirSync(nodePath.join(root, ".pi"));
        writeFileSync(
          nodePath.join(root, ".pi/mcp.json"),
          json({
            mcpServers: { foo_bar: { type: "http", url: "https://mcp.example.test/other" } },
          }),
        );
        const candidates = [
          { serverName: "alpha", entry: remote("https://mcp.example.test/alpha") },
          { serverName: "foo-bar", entry: remote("https://mcp.example.test/foo-bar") },
          { serverName: "gamma", entry: remote("https://mcp.example.test/gamma") },
        ];
        const separate = yield* oneAtATime(["pi"], root, candidates).pipe(Effect.flip);
        const shared = yield* inOrder(["pi"], root, candidates).pipe(Effect.flip);
        expect(shared).toEqual(separate);
        expect(shared).toMatchObject({
          _tag: "McpConfigInvalid",
          detail: "Pi server names collide after native hyphen/underscore normalization",
        });
      }),
    ),
  );

  it.effect("does no filesystem work without servers", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        writeFileSync(nodePath.join(root, ".mcp.json"), json({ mcpServers: {} }));
        recording.reset();
        expect(yield* inOrder(["claude-code"], root, [])).toEqual([]);
        expect(recording.calls()).toEqual([]);
      }),
    ),
  );
});

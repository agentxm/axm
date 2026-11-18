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
import { resolveConfiguredMcpTargets } from "./targeting.js";

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
  discovered?: ReadonlyArray<{ readonly path: string; readonly raw: string }>,
) =>
  validateInlineMcpServerTargetsInOrder(
    agentIds,
    { nativeDirectoryInputs, workspaceRoot: root },
    candidates,
    discovered,
  );

/** Every recorded call other than a content read: the location observations. */
const observations = (recording: FileSystemRecorder["Service"]) =>
  recording
    .calls()
    .filter(
      (call) =>
        call.method !== "readFile" &&
        call.method !== "file.read" &&
        call.method !== "file.readAlloc",
    ).length;

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

  it.effect("drops only the repeated target resolution and rechecks every alias per server", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(file, json({ mcpServers: {} }));
        const candidates = [
          { serverName: "alpha", entry: remote("https://mcp.example.test/alpha") },
          { serverName: "beta", entry: remote("https://mcp.example.test/beta") },
          { serverName: "gamma", entry: remote("https://mcp.example.test/gamma") },
        ];

        recording.reset();
        yield* resolveConfiguredMcpTargets({
          agentIds: ["claude-code"],
          scope: "project",
          workspaceRoot: root,
          nativeDirectoryInputs,
        });
        const resolution = observations(recording);
        const resolutionStats = recording.counts(file).stat ?? 0;

        recording.reset();
        const separate = yield* oneAtATime(["claude-code"], root, candidates);
        const separateObservations = observations(recording);
        const separateStats = recording.counts(file).stat ?? 0;

        recording.reset();
        const shared = yield* inOrder(["claude-code"], root, candidates);
        const sharedObservations = observations(recording);
        const sharedStats = recording.counts(file).stat ?? 0;

        expect(shared).toEqual(separate);
        // Each declared alias of the shared file is re-resolved, with one stat of it, per server.
        const aliases = shared.map(({ plan }) =>
          plan.writes.map((write) => write.declaredTargets.length),
        );
        expect(aliases).toEqual([[7], [7], [7]]);
        expect({ resolutionStats, separateStats, sharedStats }).toEqual({
          resolutionStats: 1,
          separateStats: 3 * (1 + 7),
          sharedStats: 1 + 3 * 7,
        });
        // Everything else each server does on its own stays; only two resolutions are gone.
        expect(resolution).toBeGreaterThan(0);
        expect(separateObservations - sharedObservations).toBe(2 * resolution);
      }),
    ),
  );

  it.effect("validates a planned write against the text the caller read at its path", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const file = nodePath.join(root, ".mcp.json");
        const raw = json({ mcpServers: { foreign: { command: "foreign-server" } } });
        writeFileSync(file, raw);
        const candidates = [
          { serverName: "alpha", entry: remote("https://mcp.example.test/alpha") },
          { serverName: "beta", entry: remote("https://mcp.example.test/beta") },
        ];

        recording.reset();
        const read = yield* inOrder(["claude-code"], root, candidates);
        const readReads = recording.contentReads(file);

        recording.reset();
        const handed = yield* inOrder(["claude-code"], root, candidates, [{ path: file, raw }]);
        const handedReads = recording.contentReads(file);

        recording.reset();
        // Text read at another spelling of the path is not the planned write's preimage.
        const elsewhere = yield* inOrder(["claude-code"], root, candidates, [
          { path: `${root}${nodePath.sep}sub${nodePath.sep}..${nodePath.sep}.mcp.json`, raw },
        ]);
        const elsewhereReads = recording.contentReads(file);

        expect(handed).toEqual(read);
        expect(elsewhere).toEqual(read);
        // The competing-entry read of the target resolution remains.
        expect({ readReads, handedReads, elsewhereReads }).toEqual({
          readReads: 2,
          handedReads: 1,
          elsewhereReads: 2,
        });
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

  it.effect("keeps the first server's refusal when two servers would be refused", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        mkdirSync(nodePath.join(root, ".pi"));
        writeFileSync(
          nodePath.join(root, ".pi/mcp.json"),
          json({
            mcpServers: { foo_bar: { type: "http", url: "https://mcp.example.test/other" } },
          }),
        );
        const alpha = { serverName: "alpha", entry: remote("https://mcp.example.test/alpha") };
        const colliding = {
          serverName: "foo-bar",
          entry: remote("https://mcp.example.test/foo-bar"),
        };
        // No connection and no manifest: the plan itself is refused.
        const unconnected: InlineMcpServerCandidate = {
          serverName: "delta",
          entry: { kind: "inline", enabled: true },
        };
        const own = (candidate: InlineMcpServerCandidate) =>
          oneAtATime(["pi"], root, [candidate]).pipe(Effect.flip);
        const collision = yield* own(colliding);
        const unplannable = yield* own(unconnected);
        expect(collision).toMatchObject({ _tag: "McpConfigInvalid" });
        expect(unplannable).toMatchObject({
          _tag: "McpDefinitionInvalid",
          detail: "MCP connection has no invocation or accepted manifest",
        });

        const orders: ReadonlyArray<{
          readonly candidates: ReadonlyArray<InlineMcpServerCandidate>;
          readonly first: unknown;
        }> = [
          { candidates: [alpha, colliding, unconnected], first: collision },
          { candidates: [alpha, unconnected, colliding], first: unplannable },
        ];
        for (const { candidates, first } of orders) {
          const separate = yield* oneAtATime(["pi"], root, candidates).pipe(Effect.flip);
          const shared = yield* inOrder(["pi"], root, candidates).pipe(Effect.flip);
          expect(shared).toEqual(separate);
          expect(shared).toEqual(first);
        }
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

/**
 * Work evidence for MCP inspection. One inspection judges each configured
 * agent against the physical target its target resolution admitted live, and
 * agents that share a native file read it once. Within one inspection read
 * view, inspections of different connections share one target resolution.
 * These counts run beneath the production file system over real temporary
 * workspaces.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { syncInlineMcpServerToAgents } from "../../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import type { McpServerEntry } from "../../workspace-state/index.js";
import { inspectDesiredMcpServer, withMcpInspectionReadView } from "./inspection.js";

const nativeDirectoryInputs = { skillsDirectoryOverrides: {} };

const inlineEntry = (command: string): McpServerEntry => ({
  kind: "inline",
  connection: { transport: "stdio", command, env: {} },
  enabled: true,
});

/** A real workspace directory, spelled physically, removed when the case ends. */
const withWorkspace = <A, E, R>(use: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => realpathSync(mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-inspect-")))),
    use,
    (root) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );

const recorded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        layerRecordingFileSystem(NodeServices.layer),
        NativeWriteAuthorityPermissive,
      ),
    ),
  );

/** Project `name` into every agent's native file, as a sync would. */
const project = (root: string, agentIds: ReadonlyArray<string>, name: string) =>
  syncInlineMcpServerToAgents(agentIds, {
    nativeDirectoryInputs,
    workspaceRoot: root,
    serverName: name,
    entry: inlineEntry("node"),
  });

const inspect = (
  root: string,
  agentIds: ReadonlyArray<string>,
  name: string,
  state: "projected" | "current" = "current",
  scope: "project" | "user" = "project",
  inputs: typeof nativeDirectoryInputs & {
    readonly xdgConfigRoot?: string;
  } = nativeDirectoryInputs,
) =>
  inspectDesiredMcpServer({
    nativeDirectoryInputs: inputs,
    workspaceRoot: root,
    scope,
    agentIds,
    node: { name, authority: "inline" },
    entry: inlineEntry("node"),
    canonicalPaths: [],
    state,
  });

describe("MCP inspection work within one inspection", () => {
  for (const state of ["current", "projected"] as const) {
    it.effect(`judges agents sharing one file from one admission and one read (${state})`, () =>
      withWorkspace((root) =>
        Effect.gen(function* () {
          const agentIds = ["claude-code", "github-copilot-cli"];
          yield* project(root, agentIds, "review");
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const inspection = yield* inspect(root, agentIds, "review", state);
          const shared = nodePath.join(root, ".mcp.json");
          expect({
            inspections: inspection.inspections.map((agent) => [
              agent.agentId,
              agent.status,
              agent.absolutePath,
            ]),
            current: inspection.current,
            reads: recording.contentReads(shared),
            readLinks: recording.counts(shared).readLink ?? 0,
          }).toEqual({
            inspections: [
              ["claude-code", "match", shared],
              ["github-copilot-cli", "match", shared],
            ],
            current: true,
            // The target resolution reads the file once for the competing-entry checks; a
            // current inspection reads it once more for both agents, where each agent read it.
            reads: state === "current" ? 2 : 1,
            // The resolution's one live admission stands for both agents, which each admitted
            // the resolved target again (three readLinks).
            readLinks: 1,
          });
        }),
      ).pipe(recorded),
    );
  }
});

describe("MCP inspection of a reader under another native root", () => {
  it.effect("still admits that reader under its own root and refuses its escape", () =>
    withWorkspace((home) =>
      Effect.gen(function* () {
        // OpenCode's JSONC reader, beneath the configuration root, aliases Cursor's file.
        const cursor = nodePath.join(home, ".cursor/mcp.json");
        mkdirSync(nodePath.dirname(cursor), { recursive: true });
        writeFileSync(cursor, `${JSON.stringify({ mcpServers: {} })}\n`);
        const alias = nodePath.join(home, ".config/opencode/opencode.jsonc");
        mkdirSync(nodePath.dirname(alias), { recursive: true });
        symlinkSync("../../.cursor/mcp.json", alias);
        const recording = yield* FileSystemRecorder;
        recording.reset();
        const failure = yield* inspect(home, ["cursor", "opencode"], "review", "current", "user", {
          ...nativeDirectoryInputs,
          xdgConfigRoot: nodePath.join(home, ".config"),
        }).pipe(Effect.flip);
        expect({
          failure: [failure._tag, "detail" in failure ? failure.detail : undefined],
          readLinks: recording.counts(cursor).readLink ?? 0,
        }).toEqual({
          failure: ["McpConfigInvalid", `Cannot use MCP location ${cursor}: escape`],
          // Cursor's live admission, then OpenCode's own admission under its root; Cursor no
          // longer admits its resolved target a second time.
          readLinks: 2,
        });
      }),
    ).pipe(recorded),
  );
});

describe("MCP inspection work within one inspection read view", () => {
  for (const view of ["inside", "outside"] as const) {
    it.effect(`resolves configured targets for two connections ${view} one view`, () =>
      withWorkspace((root) =>
        Effect.gen(function* () {
          const agentIds = ["claude-code", "codebuddy"];
          yield* project(root, agentIds, "review");
          yield* project(root, agentIds, "lint");
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const both = Effect.all([
            inspect(root, agentIds, "review"),
            inspect(root, agentIds, "lint"),
          ]);
          const [review, lint] = yield* view === "inside" ? withMcpInspectionReadView(both) : both;
          expect({
            current: [review.current, lint.current],
            // Only a target resolution captures this catalog reader location.
            captures: recording.counts(nodePath.join(root, ".cursor/mcp.json")).realPath ?? 0,
          }).toEqual({
            current: [true, true],
            // One resolution serves both connections inside the view; each resolves outside it.
            captures: view === "inside" ? 1 : 2,
          });
        }),
      ).pipe(recorded),
    );
  }

  it.effect(
    "completes a connection still awaiting the shared resolution when another is interrupted",
    () =>
      withWorkspace((root) =>
        Effect.gen(function* () {
          const agentIds = ["claude-code", "codebuddy"];
          yield* project(root, agentIds, "review");
          yield* project(root, agentIds, "lint");
          const fs = yield* FileSystem.FileSystem;
          const captured = nodePath.join(root, ".cursor/mcp.json");
          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          // Every resolution that reaches this location, including one interrupted before it
          // records the capture; a restarted resolution would reach it twice.
          let resolutions = 0;
          // The resolution pauses at a location only it captures until released.
          const paused: FileSystem.FileSystem = {
            ...fs,
            realPath: (path) =>
              path === captured
                ? Effect.sync(() => resolutions++).pipe(
                    Effect.andThen(Deferred.succeed(started, undefined)),
                    Effect.andThen(Deferred.await(release)),
                    Effect.andThen(fs.realPath(path)),
                  )
                : fs.realPath(path),
          };
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const lint = yield* withMcpInspectionReadView(
            Effect.gen(function* () {
              const first = yield* Effect.forkChild(inspect(root, agentIds, "review"));
              yield* Deferred.await(started);
              const second = yield* Effect.forkChild(inspect(root, agentIds, "lint"));
              // Let the second inspection reach the shared resolution before the first leaves it.
              for (let turn = 0; turn < 10; turn++) yield* Effect.yieldNow;
              yield* Fiber.interrupt(first);
              yield* Deferred.succeed(release, undefined);
              return yield* Fiber.join(second);
            }),
          ).pipe(Effect.provideService(FileSystem.FileSystem, paused));
          expect({
            current: lint.current,
            statuses: lint.inspections.map((agent) => [agent.agentId, agent.status]),
            // The abandoned consumer's resolution kept running for the one still awaiting it:
            // no second resolution started, and the one that ran captured the location once.
            resolutions,
            captures: recording.counts(captured).realPath ?? 0,
          }).toEqual({
            current: true,
            statuses: [
              ["claude-code", "match"],
              ["codebuddy", "match"],
            ],
            resolutions: 1,
            captures: 1,
          });
        }),
      ).pipe(recorded),
  );
});

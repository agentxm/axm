/**
 * A sync that reinstalls an MCP server sets its unchanged settings entry.
 *
 * No activation published the entry before the sweep, so that setting is the
 * only publication that normalizes an `axm.json` a person wrote in a form the
 * settings writer would not. Runs over a real temporary workspace and a
 * `file://` Registry.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
} from "../testing/install-world.js";
import { applySyncAcceptingExecutionChanges, expectResolved } from "../testing/sync-fixture.js";

describe("Sync reinstalling an MCP server over a non-normalized axm.json", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "normalizes the unchanged entry with one publication",
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      const settingsPath = nodePath.join(workspace.root, "axm.json");
      return workspace
        .provide(
          Effect.gen(function* () {
            const recording = yield* FileSystemRecorder;
            const installed = yield* applyInstallAcceptingExecutionChanges(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "test:@acme/mcps/context" },
              }),
            );
            expect(deriveOperationOutcome(installed)).toBe("applied");
            const normalized = workspace.readFile("axm.json");
            const parsed: unknown = JSON.parse(normalized);
            if (typeof parsed !== "object" || parsed === null || !("mcpServers" in parsed))
              throw new Error("Expected an mcpServers section");
            const servers = parsed.mcpServers;
            if (typeof servers !== "object" || servers === null || !("context" in servers))
              throw new Error("Expected the context entry");
            const entry = servers.context;
            if (typeof entry !== "object" || entry === null)
              throw new Error("Expected an object entry");
            // The same entry, with the activation the settings writer leaves implicit.
            workspace.writeFile(
              "axm.json",
              `${JSON.stringify(
                { ...parsed, mcpServers: { ...servers, context: { ...entry, enabled: true } } },
                null,
                2,
              )}\n`,
            );
            // The agent's native entry is missing, so the sweep materializes the server.
            fs.rmSync(nodePath.join(workspace.root, ".mcp.json"));
            recording.reset();
            const synced = yield* applySyncAcceptingExecutionChanges();
            expect(deriveOperationOutcome(expectResolved(synced))).toBe("applied");
            expect(fs.existsSync(nodePath.join(workspace.root, ".mcp.json"))).toBe(true);
            expect(workspace.readFile("axm.json")).toBe(normalized);
            expect(
              recording.calls({ method: "rename" }).filter((call) => call.toPath === settingsPath)
                .length,
            ).toBe(1);
          }),
        )
        .pipe(
          Effect.provide(
            layerRecordingFileSystem(NodeFileSystem.layer).pipe(
              Layer.provideMerge(NodeServices.layer),
            ),
          ),
        );
    },
    { timeout: 60_000 },
  );
});

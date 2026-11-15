/**
 * Work evidence for manifest-backed MCP sync: a caller that already decoded
 * the canonical manifest hands it over instead of having the sync read and
 * decode the same file again, and a caller that did not still has the sync
 * read it itself.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { workObservations } from "../../locations/testing.js";
import { NativeWriteAuthorityPermissive } from "../testing.js";
import type { NativeWriteAuthority } from "../native-write-authority.js";
import { decodeMcpServerManifestAt } from "./manifest.js";
import { syncManifestMcpServerToAgents } from "./sync.js";

const manifestDocument = {
  owner: "@acme",
  type: "mcp-server",
  name: "context",
  version: "1.0.0",
  server: {
    name: "ai.acme/context",
    description: "Context",
    version: "1.0.0",
    packages: [
      {
        registryType: "npm",
        identifier: "@acme/context",
        version: "1.0.0",
        transport: { type: "stdio" },
      },
    ],
  },
};

/** Freeze every nested value, so a sync that mutated its input would throw. */
const deepFreeze = <A>(value: A): A => {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

/** A real workspace with a canonical package directory, removed when the case ends. */
const withWorkspace = <A, E, R>(
  use: (paths: {
    readonly root: string;
    readonly canonicalPath: string;
    readonly manifestPath: string;
  }) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-manifest-input-"));
      const canonicalPath = nodePath.join(root, "canonical");
      mkdirSync(canonicalPath);
      const manifestPath = nodePath.join(canonicalPath, "mcp.json");
      writeFileSync(manifestPath, JSON.stringify(manifestDocument));
      return { root, canonicalPath, manifestPath };
    }),
    use,
    ({ root }) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );

/** Run with a recording filesystem and a work observer, counting the manifest's reads and decodes. */
const observe = <A, E, R>(manifestPath: string, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const observations = workObservations(false);
    recording.reset();
    const result = yield* effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      observations.provide,
    );
    return {
      result,
      reads: recording.contentReads(manifestPath),
      decodes: observations.facts.filter(
        (fact) =>
          fact.kind === "axm.parse.manifest" && fact.attributes["axm.manifest.kind"] === "mcp",
      ).length,
    };
  });

const syncContext = (
  paths: { readonly root: string; readonly canonicalPath: string },
  agentIds: ReadonlyArray<string>,
) => ({
  agentIds,
  nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
  workspaceRoot: paths.root,
  scope: "project" as const,
  serverName: "context",
  canonicalPath: paths.canonicalPath,
  enabled: true,
  // The install persisted the manifest's one package distribution.
  distribution: {
    kind: "package" as const,
    registryType: "npm",
    identifier: "@acme/context",
    transport: "stdio" as const,
  },
});

const provided = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices | NativeWriteAuthority>,
) => effect.pipe(Effect.provide(Layer.merge(NodeServices.layer, NativeWriteAuthorityPermissive)));

describe("manifest-backed MCP sync input", () => {
  it.effect("reads and decodes the canonical manifest itself when none is handed over", () =>
    provided(
      withWorkspace((paths) =>
        Effect.gen(function* () {
          const observed = yield* observe(
            paths.manifestPath,
            syncManifestMcpServerToAgents(syncContext(paths, ["claude-code"])),
          );
          expect(observed.result.map((outcome) => outcome._tag)).toEqual(["success"]);
          expect({ decodes: observed.decodes, reads: observed.reads }).toEqual({
            decodes: 1,
            reads: 1,
          });
        }),
      ),
    ),
  );

  it.effect("projects a handed-over manifest without reading it again", () =>
    provided(
      withWorkspace((paths) =>
        Effect.gen(function* () {
          const manifest = yield* decodeMcpServerManifestAt(paths.manifestPath);
          const observed = yield* observe(
            paths.manifestPath,
            syncManifestMcpServerToAgents({
              ...syncContext(paths, ["claude-code"]),
              manifest: deepFreeze(manifest),
            }),
          );
          expect(observed.result.map((outcome) => outcome._tag)).toEqual(["success"]);
          expect({ decodes: observed.decodes, reads: observed.reads }).toEqual({
            decodes: 0,
            reads: 0,
          });
          expect(
            JSON.parse(readFileSync(nodePath.join(paths.root, ".mcp.json"), "utf8")),
          ).toMatchObject({
            mcpServers: {
              context: { type: "stdio", command: "npx", args: ["-y", "@acme/context@1.0.0"] },
            },
          });
        }),
      ),
    ),
  );

  it.effect("does no manifest work without configured agents", () =>
    provided(
      withWorkspace((paths) =>
        Effect.gen(function* () {
          const observed = yield* observe(
            paths.manifestPath,
            syncManifestMcpServerToAgents(syncContext(paths, [])),
          );
          expect(observed.result).toEqual([]);
          expect({ decodes: observed.decodes, reads: observed.reads }).toEqual({
            decodes: 0,
            reads: 0,
          });
        }),
      ),
    ),
  );
});

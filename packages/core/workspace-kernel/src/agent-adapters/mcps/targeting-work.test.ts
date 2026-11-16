/**
 * Work evidence for resolving configured MCP targets: within one resolution,
 * agents that share a native MCP file admit its location, read its bytes and
 * resolve its referent once, while each agent still decodes the bytes with its
 * own grammar and keeps its own competing-entry findings.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { resolveConfiguredMcpTargets } from "./targeting.js";

const nativeDirectoryInputs = { skillsDirectoryOverrides: {} };

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A real workspace directory, spelled physically, removed when the case ends. */
const withWorkspace = <A, E, R>(use: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => realpathSync(mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-targets-")))),
    use,
    (root) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );

/** Resolve once beneath a recording filesystem, after fixture setup is forgotten. */
const resolveCounted = (
  root: string,
  agentIds: ReadonlyArray<string>,
  alias = nodePath.join(root, ".github/mcp.json"),
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const groups = yield* resolveConfiguredMcpTargets({
      agentIds,
      scope: "project",
      workspaceRoot: root,
      nativeDirectoryInputs,
    });
    const shared = nodePath.join(root, ".mcp.json");
    return {
      groups: groups.map((group) => ({
        path: group.path,
        members: group.members.map((member) => [member.agentId, member.configured]),
        competing: group.competingEntries?.map((entry) => [entry.name, entry.blocks]) ?? [],
      })),
      reads: recording.contentReads(shared),
      realPaths: recording.counts(shared).realPath ?? 0,
      readLinks: recording.counts(shared).readLink ?? 0,
      aliasReads: recording.contentReads(alias),
    };
  }).pipe(
    Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeServices.layer))),
  );

describe("configured MCP target resolution work", () => {
  it.effect("admits, reads and resolves a file shared by three agents once", () =>
    withWorkspace((root) => {
      writeFileSync(
        nodePath.join(root, ".mcp.json"),
        json({ mcpServers: { review: { command: "node" } } }),
      );
      return Effect.gen(function* () {
        const counted = yield* resolveCounted(root, [
          "claude-code",
          "codebuddy",
          "github-copilot-cli",
        ]);
        expect(counted).toEqual({
          groups: [
            {
              path: nodePath.join(root, ".mcp.json"),
              members: [
                ["claude-code", true],
                ["codebuddy", true],
                ["github-copilot-cli", true],
                ["coder-agents", false],
                ["command-code", false],
                ["vscode", false],
                ["qoder", false],
              ],
              competing: [],
            },
          ],
          // One read serves every member's competing-entry check and Copilot's bare-root check;
          // reading once per member and once more for Copilot read the file four times.
          reads: 1,
          // One capture of every catalog reader, one admission, one referent resolution; each
          // further member admitted and resolved the same spelling again (7 realPaths, 3 readLinks).
          realPaths: 3,
          readLinks: 1,
          // Copilot's own unshared location is still read.
          aliasReads: 1,
        });
      });
    }),
  );

  it.effect("does the same work for a single agent", () =>
    withWorkspace((root) => {
      writeFileSync(
        nodePath.join(root, ".mcp.json"),
        json({ mcpServers: { review: { command: "node" } } }),
      );
      return Effect.gen(function* () {
        const counted = yield* resolveCounted(root, ["claude-code"]);
        expect(counted).toEqual({
          groups: [
            {
              path: nodePath.join(root, ".mcp.json"),
              members: [
                ["claude-code", true],
                ["coder-agents", false],
                ["codebuddy", false],
                ["command-code", false],
                ["github-copilot-cli", false],
                ["vscode", false],
                ["qoder", false],
              ],
              competing: [],
            },
          ],
          reads: 1,
          realPaths: 3,
          readLinks: 1,
          aliasReads: 0,
        });
      });
    }),
  );

  it.effect("keeps reading both spellings of an aliased file", () =>
    withWorkspace((root) => {
      writeFileSync(
        nodePath.join(root, ".mcp.json"),
        json({ mcpServers: { review: { command: "node" } } }),
      );
      mkdirSync(nodePath.join(root, ".github"));
      symlinkSync("../.mcp.json", nodePath.join(root, ".github/mcp.json"));
      return Effect.gen(function* () {
        const counted = yield* resolveCounted(root, ["claude-code", "github-copilot-cli"]);
        expect(counted).toEqual({
          groups: [
            {
              path: nodePath.join(root, ".mcp.json"),
              members: [
                ["claude-code", true],
                ["github-copilot-cli", true],
                ["coder-agents", false],
                ["codebuddy", false],
                ["command-code", false],
                // Copilot's alias location reads the same physical file.
                ["github-copilot-cli", true],
                ["vscode", false],
                ["qoder", false],
              ],
              // The alias resolves to the same declaration, so nothing competes.
              competing: [],
            },
          ],
          // The physical spelling is read once; the alias spelling is read as itself.
          reads: 1,
          realPaths: 3,
          readLinks: 1,
          aliasReads: 1,
        });
      });
    }),
  );
});

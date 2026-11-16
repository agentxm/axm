/**
 * One discovery walk inspects each directory from the listing and the plugin
 * root resolution it already made: a manifest package directory is listed
 * once however many manifests it holds, and a portable plugin's MCP
 * containment check compares against the plugin root its distribution read
 * resolved, while the MCP configuration itself is still probed, resolved,
 * checked and read live.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  discoverExtensionPackages,
  isManifestExtensionPackage,
  type DiscoveredExtensionPackage,
  type ExtensionPackageFilter,
} from "./package-discovery.js";

const write = (file: string, content: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
};

const nameOf = (candidate: DiscoveredExtensionPackage) =>
  isManifestExtensionPackage(candidate) ? candidate.identity.name : candidate.name;

const everything: ExtensionPackageFilter = { names: [], owner: Option.none(), type: "*" };

/** Discover under a recording filesystem whose recording starts after fixture setup. */
const discover = (root: string, filter: ExtensionPackageFilter) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const discovered = yield* discoverExtensionPackages(root, filter).pipe(Effect.result);
    return { discovered, recording };
  }).pipe(
    Effect.provide(Layer.mergeAll(layerRecordingFileSystem(NodeFileSystem.layer), NodePath.layer)),
  );

const writeAgentPlugin = (root: string) => {
  write(path.join(root, "plugin.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "reviews",
  });
  write(
    path.join(root, "skills", "review", "SKILL.md"),
    "---\nname: review\ndescription: Review changes\n---\n",
  );
  write(path.join(root, "mcp.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { alpha: {} },
  });
};

describe("discovery walk work", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-discovery-work-")));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("lists each manifest package directory once, however many manifests it holds", () =>
    Effect.gen(function* () {
      const single = path.join(tempDir, "single");
      const pair = path.join(tempDir, "pair");
      const plain = path.join(tempDir, "plain");
      const plugin = path.join(tempDir, "plugin");
      write(path.join(single, "skill.json"), {
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
      });
      write(path.join(pair, "skill.json"), {
        owner: "@acme",
        type: "skill",
        name: "assist",
        version: "1.0.0",
      });
      write(path.join(pair, "rule.json"), {
        owner: "@acme",
        type: "rule",
        name: "policy",
        version: "1.0.0",
      });
      write(path.join(plain, "notes.md"), "# Notes\n");
      write(path.join(plugin, ".claude-plugin", "plugin.json"), { name: "helper" });
      write(
        path.join(plugin, "skills", "helper", "SKILL.md"),
        "---\nname: helper\ndescription: Helps\n---\n",
      );

      const { discovered, recording } = yield* discover(tempDir, everything);

      expect(discovered._tag).toBe("Success");
      const candidates = discovered._tag === "Success" ? discovered.success : [];
      expect(
        candidates.map((candidate) =>
          isManifestExtensionPackage(candidate)
            ? [candidate.directory, candidate.identity.type, candidate.identity.name]
            : [candidate.directory, candidate.kind, candidate.name],
        ),
      ).toStrictEqual([
        [pair, "rule", "policy"],
        [pair, "skill", "assist"],
        [path.join(plugin, "skills", "helper"), "portable-skill", "helper"],
        [single, "skill", "review"],
      ]);
      const listings = (directory: string) =>
        recording.calls({ method: "readDirectory", path: directory }).length;
      expect({
        single: listings(single),
        pair: listings(pair),
        plain: listings(plain),
        plugin: listings(plugin),
      }).toStrictEqual({ single: 1, pair: 1, plain: 1, plugin: 1 });
      expect([
        recording.contentReads(path.join(single, "skill.json")),
        recording.contentReads(path.join(pair, "skill.json")),
        recording.contentReads(path.join(pair, "rule.json")),
      ]).toStrictEqual([1, 1, 1]);
    }),
  );

  it.effect("checks a portable plugin's MCP configuration against the resolved plugin root", () =>
    Effect.gen(function* () {
      writeAgentPlugin(tempDir);

      const { discovered, recording } = yield* discover(tempDir, {
        ...everything,
        type: "mcp-server",
      });

      expect(discovered._tag).toBe("Success");
      expect(discovered._tag === "Success" ? discovered.success : []).toStrictEqual([
        {
          kind: "plugin-mcp",
          standing: "offered",
          directory: tempDir,
          sourcePath: ".",
          name: "alpha",
          nativeComponent: { format: "agent-plugins", configPath: "mcp.json", name: "alpha" },
          distribution: {
            format: "agent-plugins",
            packageRoot: ".",
            componentPath: ".",
            manifestPath: "plugin.json",
          },
        },
      ]);
      const config = path.join(tempDir, "mcp.json");
      expect(recording.calls({ method: "realPath", path: tempDir })).toHaveLength(1);
      expect(recording.calls({ method: "realPath", path: config })).toHaveLength(1);
      expect(recording.calls({ method: "access", path: config })).toHaveLength(1);
      expect(recording.contentReads(config)).toBe(1);
    }),
  );

  it.effect("resolves the plugin root once when MCP discovery is not requested", () =>
    Effect.gen(function* () {
      writeAgentPlugin(tempDir);

      const { discovered, recording } = yield* discover(tempDir, { ...everything, type: "skill" });

      expect(discovered._tag).toBe("Success");
      expect(recording.calls({ method: "realPath", path: tempDir })).toHaveLength(1);
      expect(recording.counts(path.join(tempDir, "mcp.json"))).toStrictEqual({});
    }),
  );

  it.effect(
    "resolves each marketplace member's root for its MCP check without resolving again",
    () =>
      Effect.gen(function* () {
        const member = path.join(tempDir, "plugins", "reviews");
        write(path.join(tempDir, ".claude-plugin", "marketplace.json"), {
          plugins: [{ name: "reviews", source: "./plugins/reviews" }],
        });
        writeAgentPlugin(member);

        const { discovered, recording } = yield* discover(tempDir, {
          ...everything,
          type: "mcp-server",
        });

        expect(discovered._tag).toBe("Success");
        const candidates = discovered._tag === "Success" ? discovered.success : [];
        expect(
          candidates.map((candidate) => [candidate.kind, candidate.directory, nameOf(candidate)]),
        ).toStrictEqual([["plugin-mcp", member, "alpha"]]);
        // One resolution proves membership containment; one roots the member's distribution.
        expect(recording.calls({ method: "realPath", path: member })).toHaveLength(2);
        expect(
          recording.calls({ method: "realPath", path: path.join(member, "mcp.json") }),
        ).toHaveLength(1);
      }),
  );

  it.effect("accepts a plugin reached through a directory alias", () =>
    Effect.gen(function* () {
      const target = path.join(tempDir, "target");
      const alias = path.join(tempDir, "alias");
      writeAgentPlugin(target);
      fs.symlinkSync(target, alias, "dir");

      const { discovered, recording } = yield* discover(alias, {
        ...everything,
        type: "mcp-server",
      });

      expect(discovered._tag).toBe("Success");
      const candidates = discovered._tag === "Success" ? discovered.success : [];
      expect(
        candidates.map((candidate) => [candidate.kind, candidate.directory, nameOf(candidate)]),
      ).toStrictEqual([["plugin-mcp", alias, "alpha"]]);
      expect(recording.calls({ method: "realPath", path: alias })).toHaveLength(1);
    }),
  );

  it.effect("refuses an MCP configuration that resolves outside its plugin", () =>
    Effect.gen(function* () {
      const plugin = path.join(tempDir, "plugin");
      const outside = path.join(tempDir, "outside.json");
      writeAgentPlugin(plugin);
      fs.renameSync(path.join(plugin, "mcp.json"), outside);
      fs.symlinkSync(outside, path.join(plugin, "mcp.json"));

      const { discovered } = yield* discover(plugin, { ...everything, type: "mcp-server" });

      expect(discovered._tag).toBe("Failure");
      if (discovered._tag === "Failure") {
        expect(discovered.failure._tag).toBe("SourceNotResolvable");
        expect(discovered.failure.detail).toBe("Plugin MCP configuration escapes its package");
      }
    }),
  );
});

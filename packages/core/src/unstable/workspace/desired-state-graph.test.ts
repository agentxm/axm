import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { expect, layer } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { buildDesiredStateGraph } from "./desired-state-graph.js";

const writePack = (
  root: string,
  owner: string,
  name: string,
  dependencies: Readonly<Record<string, string>>,
) => {
  const dir = nodePath.join(root, ".axm", "extensions", owner, "packs", name);
  nodeFs.mkdirSync(dir, { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(dir, "pack.json"),
    JSON.stringify({
      owner,
      type: "pack",
      name,
      version: "1.0.0",
      dependencies,
    }),
  );
};

layer(NodeServices.layer, { excludeTestServices: true })("desired workspace state graph", (it) => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-desired-graph-"));
  });

  afterEach(() => {
    nodeFs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("expands a configured pack across every leaf extension type", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "complete", {
        "@acme/skills/review": "^1.0.0",
        "@acme/commands/release": "^1.0.0",
        "@acme/mcps/browser": "^1.0.0",
        "@acme/subagents/planner": "^1.0.0",
        "@acme/files/baseline": "^1.0.0",
        "@acme/rules/security": "^1.0.0",
        "@acme/hooks/preflight": "^1.0.0",
        "@acme/knowledge/handbook": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            complete: { source: "@acme/packs/complete" },
          },
        },
      });

      expect(graph.complete).toBe(true);
      expect(graph.problems).toEqual([]);
      expect(graph.nodes.map((node) => node.type)).toEqual([
        "skill",
        "command",
        "mcp-server",
        "subagent",
        "files",
        "rule",
        "hook",
        "knowledge",
        "pack",
      ]);
      expect(
        graph.nodes.filter((node) => node.origins.some((origin) => origin.type === "pack")),
      ).toHaveLength(8);
    }),
  );

  it.effect("retains multiple pack constraints and rejects an empty intersection", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "one", {
        "@acme/skills/review": "^1.0.0",
      });
      writePack(root, "@acme", "two", {
        "@acme/skills/review": "^2.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            one: { source: "@acme/packs/one" },
            two: { source: "@acme/packs/two" },
          },
        },
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      expect(review?.constraints).toEqual(["^1.0.0", "^2.0.0"]);
      expect(graph.complete).toBe(false);
      expect(graph.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "constraint-conflict",
            extensionType: "skill",
            name: "review",
          }),
        ]),
      );
    }),
  );

  it.effect("rejects a three-way conflict even when every pair intersects", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "one", {
        "@acme/skills/review": "^1.0.0 || ^3.0.0",
      });
      writePack(root, "@acme", "two", {
        "@acme/skills/review": "^1.0.0 || ^2.0.0",
      });
      writePack(root, "@acme", "three", {
        "@acme/skills/review": "^2.0.0 || ^3.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            one: { source: "@acme/packs/one" },
            two: { source: "@acme/packs/two" },
            three: { source: "@acme/packs/three" },
          },
        },
      });

      expect(graph.complete).toBe(false);
      expect(graph.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "constraint-conflict",
            extensionType: "skill",
            name: "review",
          }),
        ]),
      );
    }),
  );

  it.effect("treats a missing authoritative pack manifest as unknown desired state", () =>
    Effect.gen(function* () {
      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            missing: { source: "@acme/packs/missing" },
          },
        },
      });

      expect(graph.complete).toBe(false);
      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/missing",
        }),
      ]);
    }),
  );

  it.effect("keeps a disabled direct declaration active when a pack still requires it", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          skills: {
            review: {
              source: "@acme/skills/review@^1.0.0",
              enabled: false,
            },
          },
          packs: {
            reviewers: { source: "@acme/packs/reviewers" },
          },
        },
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      expect(review?.enabled).toBe(true);
      expect(review?.origins.map((origin) => origin.type)).toEqual(["settings", "pack"]);
    }),
  );

  it.effect("merges workspace authorship with a pack dependency for the same package", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          skills: {
            review: {
              source: "workspace:@acme/skills/review",
              enabled: true,
            },
          },
          packs: {
            reviewers: { source: "workspace:@acme/packs/reviewers" },
          },
        },
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      expect(graph.complete).toBe(true);
      expect(review?.identity).toBe("workspace:@acme/skills/review");
      expect(review?.constraints).toEqual(["^1.0.0"]);
      expect(review?.origins.map((origin) => origin.type)).toEqual(["settings", "pack"]);
    }),
  );

  it.effect("rejects different owners competing for one simple-name projection", () =>
    Effect.gen(function* () {
      writePack(root, "@one", "one", {
        "@one/skills/review": "^1.0.0",
      });
      writePack(root, "@two", "two", {
        "@two/skills/review": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            one: { source: "@one/packs/one" },
            two: { source: "@two/packs/two" },
          },
        },
      });

      expect(graph.complete).toBe(false);
      expect(graph.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "projection-collision",
            extensionType: "skill",
            name: "review",
          }),
        ]),
      );
    }),
  );

  it.effect("rejects a canonical pack manifest whose identity differs from settings", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "expected", {});
      const manifestPath = nodePath.join(
        root,
        ".axm",
        "extensions",
        "@acme",
        "packs",
        "expected",
        "pack.json",
      );
      const manifest = JSON.parse(nodeFs.readFileSync(manifestPath, "utf8"));
      manifest.name = "other";
      nodeFs.writeFileSync(manifestPath, JSON.stringify(manifest));

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            expected: { source: "@acme/packs/expected" },
          },
        },
      });

      expect(graph.complete).toBe(false);
      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "pack-identity-mismatch",
          pack: "@acme/packs/expected",
        }),
      ]);
    }),
  );
});

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { expect, layer } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { handle } from "../test-helpers.js";
import { PackManifestSchema } from "../packs/manifest-schema.js";
import { buildDesiredStateGraph, type ProspectivePackRef } from "./desired-state-graph.js";

const writePack = (
  root: string,
  owner: string,
  name: string,
  dependencies: Readonly<Record<string, string>>,
) => {
  const dir = nodePath.join(root, "agent_extensions", "agentxm", owner, "packs", name);
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

const writeAuthoredPack = (
  root: string,
  name: string,
  dependencies: Readonly<Record<string, string>>,
) => {
  const dir = nodePath.join(root, "packs", name);
  nodeFs.mkdirSync(dir, { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(dir, "pack.json"),
    JSON.stringify({
      owner: "@acme",
      type: "pack",
      name,
      version: "1.0.0",
      dependencies,
    }),
  );
};

const prospectivePack = (
  name: string,
  dependencies: Readonly<Record<string, string>>,
): ProspectivePackRef => {
  const manifest = Schema.decodeUnknownSync(PackManifestSchema)({
    owner: "@acme",
    type: "pack",
    name,
    version: "1.0.0",
    dependencies,
  });
  return {
    owner: manifest.owner,
    version: manifest.version,
    pack: { name: manifest.name, dependencies: manifest.dependencies },
  };
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
        "@acme/mcps/browser": "^1.0.0",
        "@acme/subagents/planner": "^1.0.0",
        "@acme/rules/security": "^1.0.0",
        "@acme/hooks/preflight": "^1.0.0",
        "@acme/knowledge/handbook": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            complete: { source: "@acme/packs/complete", enabled: true },
          },
        },
      });

      expect(graph.complete).toBe(true);
      expect(graph.problems).toEqual([]);
      expect(graph.nodes.map((node) => node.type)).toEqual([
        "skill",
        "mcp-server",
        "subagent",
        "rule",
        "hook",
        "knowledge",
        "pack",
      ]);
      expect(
        graph.nodes.filter((node) => node.origins.some((origin) => origin.type === "pack")),
      ).toHaveLength(6);
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
            one: { source: "@acme/packs/one", enabled: true },
            two: { source: "@acme/packs/two", enabled: true },
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
      expect(
        graph.problems.find((problem) => problem.type === "constraint-conflict"),
      ).toMatchObject({
        contributors: [
          {
            source: "pack",
            dependingPack: "@acme/packs/one",
            range: "^1.0.0",
          },
          {
            source: "pack",
            dependingPack: "@acme/packs/two",
            range: "^2.0.0",
          },
        ],
      });
    }),
  );

  it.effect("gates prospective Pack manifests before either Pack is materialized", () =>
    Effect.gen(function* () {
      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            one: { source: "@acme/packs/one", enabled: true },
            two: { source: "@acme/packs/two", enabled: true },
          },
        },
        prospectivePacks: [
          prospectivePack("one", { "@acme/skills/review": "^1.0.0" }),
          prospectivePack("two", { "@acme/skills/review": "^2.0.0" }),
        ],
      });

      expect(graph.problems).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "pack-manifest-unavailable" })]),
      );
      expect(graph.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "constraint-conflict",
            extensionType: "skill",
            name: "review",
            contributors: [
              expect.objectContaining({ dependingPack: "@acme/packs/one", range: "^1.0.0" }),
              expect.objectContaining({ dependingPack: "@acme/packs/two", range: "^2.0.0" }),
            ],
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
            one: { source: "@acme/packs/one", enabled: true },
            two: { source: "@acme/packs/two", enabled: true },
            three: { source: "@acme/packs/three", enabled: true },
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
            missing: { source: "@acme/packs/missing", enabled: true },
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

  it.effect("lets an explicit member disable override an enabled pack requirement", () =>
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
            reviewers: { source: "@acme/packs/reviewers", enabled: true },
          },
        },
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      // AXM-1268: explicit user intent wins over pack membership.
      expect(review?.enabled).toBe(false);
      expect(review?.origins.map((origin) => origin.type)).toEqual(["settings", "pack"]);
    }),
  );

  it.effect(
    "retains a direct Knowledge override as desired intent alongside and after a Pack",
    () =>
      Effect.gen(function* () {
        writePack(root, "@acme", "platform", {
          "@acme/knowledge/handbook": "^1.0.0",
        });
        const knowledge = {
          handbook: {
            source: "@acme/knowledge/handbook@^1.1.0",
            enabled: true,
            instructionEntry: false,
          },
        };

        const withPack = yield* buildDesiredStateGraph({
          baseDir: root,
          settings: {
            knowledge,
            packs: {
              platform: { source: "@acme/packs/platform", enabled: true },
            },
          },
        });
        const directOnly = yield* buildDesiredStateGraph({
          baseDir: root,
          settings: { knowledge },
        });

        const withPackNode = withPack.nodes.find(
          (node) => node.type === "knowledge" && node.name === "handbook",
        );
        const directOnlyNode = directOnly.nodes.find(
          (node) => node.type === "knowledge" && node.name === "handbook",
        );
        expect(withPackNode?.origins.map((origin) => origin.type)).toEqual(["settings", "pack"]);
        expect(withPackNode?.constraints).toEqual(["^1.1.0", "^1.0.0"]);
        expect(directOnlyNode).toMatchObject({
          source: "@acme/knowledge/handbook@>=1.1.0 <2.0.0-0",
          enabled: true,
        });
        expect(directOnlyNode?.origins).toEqual([
          expect.objectContaining({ type: "settings", source: knowledge.handbook.source }),
        ]);
      }),
  );

  it.effect("keeps a member active when another enabled pack still requires it", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });
      writePack(root, "@acme", "maintainers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            reviewers: { source: "@acme/packs/reviewers", enabled: false },
            maintainers: { source: "@acme/packs/maintainers", enabled: true },
          },
        },
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      expect(review?.enabled).toBe(true);
      expect(review?.origins).toEqual([
        expect.objectContaining({
          type: "pack",
          pack: "@acme/packs/reviewers",
          enabled: false,
        }),
        expect.objectContaining({ type: "pack", pack: "@acme/packs/maintainers" }),
      ]);
    }),
  );

  it.effect("keeps a directly enabled member active when its pack is disabled", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          skills: {
            review: { source: "@acme/skills/review@^1.0.0", enabled: true },
          },
          packs: {
            reviewers: { source: "@acme/packs/reviewers", enabled: false },
          },
        },
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      expect(review?.enabled).toBe(true);
      expect(review?.origins).toEqual([
        expect.objectContaining({ type: "settings", enabled: true }),
        expect.objectContaining({ type: "pack", enabled: false }),
      ]);
    }),
  );

  it.effect("keeps disabled Pack membership reachable without activating its dependencies", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            reviewers: { source: "@acme/packs/reviewers", enabled: false },
          },
        },
      });

      expect(graph.complete).toBe(true);
      expect(graph.nodes).toEqual([
        expect.objectContaining({ type: "skill", name: "review", enabled: false }),
        expect.objectContaining({ type: "pack", name: "reviewers", enabled: false }),
      ]);
    }),
  );

  it.effect("requires a disabled Pack manifest to preserve membership reachability", () =>
    Effect.gen(function* () {
      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          packs: {
            missing: { source: "@acme/packs/missing", enabled: false },
          },
        },
      });

      expect(graph.complete).toBe(false);
      expect(graph.problems).toEqual([
        expect.objectContaining({ type: "pack-manifest-unavailable", pack: "@acme/packs/missing" }),
      ]);
      expect(graph.nodes).toEqual([
        expect.objectContaining({ type: "pack", name: "missing", enabled: false }),
      ]);
    }),
  );

  it.effect("merges workspace authorship with a pack dependency for the same package", () =>
    Effect.gen(function* () {
      writeAuthoredPack(root, "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* buildDesiredStateGraph({
        baseDir: root,
        settings: {
          owner: handle("@acme"),
          skills: {
            review: {
              source: "workspace",
              enabled: true,
            },
          },
          packs: {
            reviewers: { source: "workspace", enabled: true },
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
            one: { source: "@one/packs/one", enabled: true },
            two: { source: "@two/packs/two", enabled: true },
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
        "agent_extensions",
        "agentxm",
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
            expected: { source: "@acme/packs/expected", enabled: true },
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

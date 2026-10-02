import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import * as Layer from "effect/Layer";
import { desiredConstraintContributors } from "./canonical-observation.js";
import { PackManifests } from "./pack-manifests.js";
import { mcpRegistryResolutionKey } from "./mcp-source-identity.js";
import { FilesystemPackManifests } from "./adapters/filesystem/pack-manifests.js";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { expect, layer } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { handle } from "../testing.js";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  versionSatisfiesRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { evaluateDesiredState } from "./desired-state-evaluation.js";
import type { ProspectivePackRef } from "./desired-state-graph.js";
import { desiredStateSettled, unresolvedPackRoutes } from "./desired-state-queries.js";
import {
  captureDesiredStateInputs,
  type CaptureDesiredStateInputsArgs,
} from "./desired-state-reader.js";

const writePack = (
  root: string,
  owner: string,
  name: string,
  dependencies: Readonly<Record<string, unknown>>,
) => {
  const dir = nodePath.join(root, "agent_extensions", "registry", owner, "packs", name);
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

/** Capture over the filesystem port, then evaluate: the reader's two steps, in a test's hands. */
const evaluate = (args: Omit<CaptureDesiredStateInputsArgs, "manifests">) =>
  Effect.gen(function* () {
    const inputs = yield* captureDesiredStateInputs({ manifests: yield* PackManifests, ...args });
    return evaluateDesiredState(inputs);
  });

layer(Layer.provideMerge(FilesystemPackManifests, NodeServices.layer), {
  excludeTestServices: true,
})("desired workspace state graph", (it) => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-desired-graph-"));
  });

  afterEach(() => {
    nodeFs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("does not infer acquired Pack dependencies from unaccepted installed content", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "complete", {
        "@acme/skills/review": "^1.0.0",
        "@acme/mcps/browser": "^1.0.0",
        "@acme/subagents/planner": "^1.0.0",
        "@acme/rules/security": "^1.0.0",
        "@acme/hooks/preflight": "^1.0.0",
        "@acme/knowledge/handbook": "^1.0.0",
      });

      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          packs: {
            complete: { source: "@acme/packs/complete", enabled: true },
          },
        },
        prospectivePacks: [],
      });

      // Installed content cannot establish accepted dependency authority.
      expect(graph.packMembership).toEqual([
        expect.objectContaining({
          pack: "@acme/packs/complete",
          declared: { status: "unknown", reason: "resolution-unavailable" },
          routes: "unauthorized",
        }),
      ]);
      expect(graph.problems).toEqual([
        expect.objectContaining({ type: "pack-resolution-unavailable" }),
      ]);
    }),
  );

  it.effect("routes a proposed pack's members across every leaf extension type", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          packs: {
            complete: { source: "@acme/packs/complete", enabled: true },
          },
        },
        prospectivePacks: [
          prospectivePack("complete", {
            "@acme/skills/review": "^1.0.0",
            "@acme/mcps/browser": "^1.0.0",
            "@acme/subagents/planner": "^1.0.0",
            "@acme/rules/security": "^1.0.0",
            "@acme/hooks/preflight": "^1.0.0",
            "@acme/knowledge/handbook": "^1.0.0",
          }),
        ],
      });

      expect(desiredStateSettled(graph)).toBe(true);
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
      expect(unresolvedPackRoutes(graph)).toEqual([]);
    }),
  );

  it.effect("binds a Pack member to its declared Registry under the accepted-resolution key", () =>
    Effect.gen(function* () {
      const declared = new URL("https://registry.example/");
      const configured = new URL("https://corp.example.test/");
      const manifest = Schema.decodeUnknownSync(PackManifestSchema)({
        owner: "@acme",
        type: "pack",
        name: "platform",
        version: "1.0.0",
        dependencies: {
          "@acme/mcps/context": {
            versionRange: "^1.0.0",
            source: { type: "registry", url: declared.href },
          },
          "@acme/mcps/inherited": "^1.0.0",
        },
      });

      const graph = yield* evaluate({
        baseDir: root,
        settings: { packs: { platform: { source: "corp:@acme/packs/platform", enabled: true } } },
        defaultRegistry: "agentxm",
        registryEndpoints: { corp: configured },
        prospectivePacks: [
          {
            owner: manifest.owner,
            version: manifest.version,
            pack: { name: manifest.name, dependencies: manifest.dependencies },
          },
        ],
      });

      const context = graph.nodes.find((node) => node.name === "context");
      const inherited = graph.nodes.find((node) => node.name === "inherited");
      // The declared endpoint is the member's Registry, and its key is the one
      // the lock row is recorded under, so the closure finds its resolution.
      expect(context?.identity).toEqual({
        authority: "registry",
        fqn: "@acme/mcps/context",
        registry: { sourceName: undefined, endpoint: declared },
        resolutionKey: mcpRegistryResolutionKey({
          authority: declared,
          owner: "@acme",
          name: "context",
        }),
      });
      expect(inherited?.identity).toEqual({
        authority: "registry",
        fqn: "@acme/mcps/inherited",
        registry: { sourceName: "corp", endpoint: configured },
        resolutionKey: mcpRegistryResolutionKey({
          authority: configured,
          owner: "@acme",
          name: "inherited",
        }),
      });
      expect(graph.mcpSourceClosures.map((closure) => closure.key)).toEqual(
        [context, inherited]
          .flatMap((node) =>
            node?.identity.authority === "registry" && node.identity.resolutionKey !== undefined
              ? [node.identity.resolutionKey]
              : [],
          )
          .sort(),
      );
    }),
  );

  it.effect("gates prospective Pack manifests before either Pack is materialized", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
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
      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      expect(review && Result.isFailure(review.constraint)).toBe(true);
      expect(review && desiredConstraintContributors(review).map(({ range }) => range)).toEqual([
        "^1.0.0",
        "^2.0.0",
      ]);
      expect(desiredStateSettled(graph)).toBe(false);
      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "constraint-conflict",
          extensionType: "skill",
          name: "review",
          contributors: [
            expect.objectContaining({ dependingPack: "@acme/packs/one", range: "^1.0.0" }),
            expect.objectContaining({ dependingPack: "@acme/packs/two", range: "^2.0.0" }),
          ],
        }),
      ]);
    }),
  );

  it.effect("rejects a three-way conflict even when every pair intersects", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          packs: {
            one: { source: "@acme/packs/one", enabled: true },
            two: { source: "@acme/packs/two", enabled: true },
            three: { source: "@acme/packs/three", enabled: true },
          },
        },
        prospectivePacks: [
          prospectivePack("one", { "@acme/skills/review": "^1.0.0 || ^3.0.0" }),
          prospectivePack("two", { "@acme/skills/review": "^1.0.0 || ^2.0.0" }),
          prospectivePack("three", { "@acme/skills/review": "^2.0.0 || ^3.0.0" }),
        ],
      });

      expect(desiredStateSettled(graph)).toBe(false);
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

  it.effect("treats a missing authored pack manifest as unknown desired state", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          owner: decodeHandleSync("@acme"),
          packs: {
            missing: { source: "workspace", enabled: true },
          },
        },
      });

      expect(desiredStateSettled(graph)).toBe(false);
      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/missing",
          reason: "absent",
        }),
      ]);
      expect(graph.packMembership).toEqual([
        expect.objectContaining({
          pack: "@acme/packs/missing",
          declared: { status: "unknown", reason: "absent" },
          routes: "unknown",
        }),
      ]);
    }),
  );

  it.effect("lets an explicit member disable override an enabled pack requirement", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
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
        prospectivePacks: [prospectivePack("reviewers", { "@acme/skills/review": "^1.0.0" })],
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      // Explicit user intent wins over pack membership.
      expect(review?.enabled).toBe(false);
      expect(review?.origins.map((origin) => origin.type)).toEqual(["settings", "pack"]);
    }),
  );

  it.effect(
    "retains a direct Knowledge override as desired intent alongside and after a Pack",
    () =>
      Effect.gen(function* () {
        const knowledge = {
          handbook: {
            source: "@acme/knowledge/handbook@^1.1.0",
            enabled: true,
            instructionEntry: false,
          },
        };

        const withPack = yield* evaluate({
          baseDir: root,
          settings: {
            knowledge,
            packs: {
              platform: { source: "@acme/packs/platform", enabled: true },
            },
          },
          prospectivePacks: [prospectivePack("platform", { "@acme/knowledge/handbook": "^1.0.0" })],
        });
        const directOnly = yield* evaluate({
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
        expect(
          withPackNode && desiredConstraintContributors(withPackNode).map(({ range }) => range),
        ).toEqual(["^1.1.0", "^1.0.0"]);
        for (const node of [withPackNode, directOnlyNode]) {
          expect(node).toMatchObject({
            identity: { authority: "registry", fqn: "@acme/knowledge/handbook" },
            enabled: true,
          });
          if (node?.source === undefined)
            throw new Error("Expected the desired Knowledge package source");
          const versionAt = node.source.lastIndexOf("@");
          expect(node.source.slice(0, versionAt)).toBe("@acme/knowledge/handbook");
          const range = decodeVersionRangeSync(node.source.slice(versionAt + 1));
          for (const version of ["1.1.0", "1.4.0", "1.99.99"]) {
            expect(versionSatisfiesRange(decodeVersionSync(version), range)).toBe(true);
          }
          for (const version of ["1.0.9", "1.1.0-alpha", "1.9.0-beta", "2.0.0-alpha", "2.0.0"]) {
            expect(versionSatisfiesRange(decodeVersionSync(version), range)).toBe(false);
          }
        }
        expect(directOnlyNode?.origins).toEqual([
          expect.objectContaining({ type: "settings", source: knowledge.handbook.source }),
        ]);
      }),
  );

  it.effect("keeps a member active when another enabled pack still requires it", () =>
    Effect.gen(function* () {
      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          packs: {
            reviewers: { source: "@acme/packs/reviewers", enabled: false },
            maintainers: { source: "@acme/packs/maintainers", enabled: true },
          },
        },
        prospectivePacks: [
          prospectivePack("reviewers", { "@acme/skills/review": "^1.0.0" }),
          prospectivePack("maintainers", { "@acme/skills/review": "^1.0.0" }),
        ],
      });

      const review = graph.nodes.find((node) => node.type === "skill" && node.name === "review");
      expect(review?.enabled).toBe(true);
      expect(review?.origins).toEqual([
        expect.objectContaining({
          type: "pack",
          pack: { authority: "registry", fqn: "@acme/packs/maintainers" },
        }),
      ]);
      expect(graph.packMembership).toEqual([
        expect.objectContaining({ pack: "@acme/packs/maintainers", routes: "active" }),
        expect.objectContaining({ pack: "@acme/packs/reviewers", routes: "dormant" }),
      ]);
    }),
  );

  it.effect("keeps a directly enabled member active when its pack is disabled", () =>
    Effect.gen(function* () {
      writePack(root, "@acme", "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* evaluate({
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
      ]);
    }),
  );

  it.effect("a disabled Pack withdraws its dependency route while remaining desired", () =>
    Effect.gen(function* () {
      writeAuthoredPack(root, "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          owner: decodeHandleSync("@acme"),
          packs: {
            reviewers: { source: "workspace", enabled: false },
          },
        },
      });

      expect(desiredStateSettled(graph)).toBe(true);
      expect(graph.nodes).toEqual([
        expect.objectContaining({ type: "pack", name: "reviewers", enabled: false }),
      ]);
      expect(graph.packMembership).toEqual([
        expect.objectContaining({
          declared: { status: "known", members: [{ type: "skill", name: "review" }] },
          routes: "dormant",
        }),
      ]);
    }),
  );

  it.effect(
    "does not require a disabled Pack manifest to establish its absent dependency route",
    () =>
      Effect.gen(function* () {
        const graph = yield* evaluate({
          baseDir: root,
          settings: {
            packs: {
              missing: { source: "@acme/packs/missing", enabled: false },
            },
          },
        });

        expect(desiredStateSettled(graph)).toBe(true);
        expect(graph.problems).toEqual([]);
        expect(graph.nodes).toEqual([
          expect.objectContaining({ type: "pack", name: "missing", enabled: false }),
        ]);
        // Nothing is routed, and nothing is claimed about what would be.
        expect(graph.packMembership).toEqual([
          expect.objectContaining({
            declared: { status: "unknown", reason: "resolution-unavailable" },
            routes: "dormant",
          }),
        ]);
        expect(unresolvedPackRoutes(graph)).toEqual([]);
      }),
  );

  it.effect("merges workspace authorship with a pack dependency for the same package", () =>
    Effect.gen(function* () {
      writeAuthoredPack(root, "reviewers", {
        "@acme/skills/review": "^1.0.0",
      });

      const graph = yield* evaluate({
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
      expect(desiredStateSettled(graph)).toBe(true);
      expect(review?.identity).toEqual({ authority: "workspace", fqn: "@acme/skills/review" });
      expect(review && desiredConstraintContributors(review).map(({ range }) => range)).toEqual([
        "^1.0.0",
      ]);
      expect(review?.origins.map((origin) => origin.type)).toEqual(["settings", "pack"]);
    }),
  );

  it.effect("rejects different owners competing for one simple-name projection", () =>
    Effect.gen(function* () {
      const one = Schema.decodeUnknownSync(PackManifestSchema)({
        owner: "@one",
        type: "pack",
        name: "one",
        version: "1.0.0",
        dependencies: { "@one/skills/review": "^1.0.0" },
      });
      const two = Schema.decodeUnknownSync(PackManifestSchema)({
        owner: "@two",
        type: "pack",
        name: "two",
        version: "1.0.0",
        dependencies: { "@two/skills/review": "^1.0.0" },
      });
      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          packs: {
            one: { source: "@one/packs/one", enabled: true },
            two: { source: "@two/packs/two", enabled: true },
          },
        },
        prospectivePacks: [one, two].map((manifest) => ({
          owner: manifest.owner,
          version: manifest.version,
          pack: { name: manifest.name, dependencies: manifest.dependencies },
        })),
      });

      expect(desiredStateSettled(graph)).toBe(false);
      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "projection-collision",
          extensionType: "skill",
          name: "review",
          identities: [
            expect.objectContaining({ fqn: "@one/skills/review" }),
            expect.objectContaining({ fqn: "@two/skills/review" }),
          ],
        }),
      ]);
    }),
  );

  it.effect("rejects an authored pack manifest whose identity differs from settings", () =>
    Effect.gen(function* () {
      writeAuthoredPack(root, "expected", {});
      const manifestPath = nodePath.join(root, "packs", "expected", "pack.json");
      const manifest = JSON.parse(nodeFs.readFileSync(manifestPath, "utf8"));
      manifest.name = "other";
      nodeFs.writeFileSync(manifestPath, JSON.stringify(manifest));

      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          owner: decodeHandleSync("@acme"),
          packs: {
            expected: { source: "workspace", enabled: true },
          },
        },
      });

      expect(desiredStateSettled(graph)).toBe(false);
      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "pack-identity-mismatch",
          pack: "@acme/packs/expected",
        }),
      ]);
      expect(graph.packMembership).toEqual([
        expect.objectContaining({ declared: { status: "unknown", reason: "identity-mismatch" } }),
      ]);
    }),
  );

  it.effect("reports a document that is not JSON and one that violates the schema distinctly", () =>
    Effect.gen(function* () {
      const dir = nodePath.join(root, "packs");
      nodeFs.mkdirSync(nodePath.join(dir, "malformed"), { recursive: true });
      nodeFs.writeFileSync(nodePath.join(dir, "malformed", "pack.json"), "{ not json");
      nodeFs.mkdirSync(nodePath.join(dir, "broken"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(dir, "broken", "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "broken",
          version: "1.0.0",
          dependencies: { "@acme/skills/review": 4242 },
        }),
      );

      const graph = yield* evaluate({
        baseDir: root,
        settings: {
          owner: decodeHandleSync("@acme"),
          packs: {
            malformed: { source: "workspace", enabled: true },
            broken: { source: "workspace", enabled: true },
          },
        },
      });

      expect(graph.problems).toEqual([
        expect.objectContaining({
          type: "pack-manifest-invalid",
          pack: "@acme/packs/broken",
          reason: "schema-invalid",
          issues: [expect.objectContaining({ path: expect.stringContaining("dependencies") })],
        }),
        expect.objectContaining({
          type: "pack-manifest-invalid",
          pack: "@acme/packs/malformed",
          reason: "malformed",
        }),
      ]);
      expect(JSON.stringify(graph.problems)).not.toContain("4242");
    }),
  );
});

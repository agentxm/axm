import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import {
  computeMaterializedTreeIntegrity,
  TreeIntegritySchema,
} from "../extensions/materialized-tree.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { makeAbsolutePath } from "../utils/path-types.js";
import { observeCanonicalExtension } from "./canonical-observation.js";
import type { DesiredExtensionNode } from "./desired-state-graph.js";
import { resolveProjectWorkspaceLayout } from "./layout.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const desiredSkill = (source = "github:acme/tools//skills/review@main"): DesiredExtensionNode => ({
  type: "skill",
  name: "review",
  identity: source,
  source,
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source, enabled: true }],
});
const placeholderTreeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);
const acceptedGit = (treeIntegrity = placeholderTreeIntegrity) => ({
  type: "github" as const,
  packageOwner: handle("@acme"),
  packageName: extensionName("review"),
  owner: "acme",
  repo: "tools",
  ref: "main",
  path: "skills/review",
  resolvedCommit: "commit-1",
  resolvedTree: "tree-1",
  contentIdentity,
  treeIntegrity,
});

const projectLayout = (root: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* resolveProjectWorkspaceLayout(makeAbsolutePath(path, root), {
      owner: handle("@acme"),
    });
  });

layer(NodeServices.layer, { excludeTestServices: true })("canonical observation", (it) => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-canonical-observation-"));
  });
  afterEach(() => nodeFs.rmSync(root, { recursive: true, force: true }));

  it.effect("requires accepted resolution for external desired content", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const observed = yield* observeCanonicalExtension({
        layout,
        desired: desiredSkill(),
        accepted: undefined,
      });
      expect(observed.status).toBe("missing-resolution");
    }),
  );

  it.effect(
    "accepts present external canonical bytes without treating local drift as authority",
    () =>
      Effect.gen(function* () {
        const layout = yield* projectLayout(root);
        const canonical = nodePath.join(root, "agent_extensions", "@acme", "skills", "review");
        nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
        nodeFs.writeFileSync(
          nodePath.join(canonical, "skill.json"),
          JSON.stringify({
            owner: "@acme",
            type: "skill",
            name: "review",
            version: "1.0.0",
          }),
        );
        nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Locally formatted\n");
        const treeIntegrity = yield* computeMaterializedTreeIntegrity(canonical);
        const observed = yield* observeCanonicalExtension({
          layout,
          desired: desiredSkill(),
          accepted: acceptedGit(treeIntegrity),
        });
        expect(observed.status).toBe("usable");
        expect(observed.path).toBe(canonical);
      }),
  );

  it.effect("detects accepted source identity mismatch", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const observed = yield* observeCanonicalExtension({
        layout,
        desired: desiredSkill("github:other/tools//skills/review@main"),
        accepted: acceptedGit(),
      });
      expect(observed.status).toBe("wrong-origin");
    }),
  );

  it.effect("enforces Registry constraints from accepted resolution state", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const source = "@acme/rules/release@^2.0.0";
      const desired: DesiredExtensionNode = {
        type: "rule",
        name: "release",
        identity: "@acme/rules/release",
        source,
        enabled: true,
        constraints: ["^2.0.0"],
        origins: [
          { type: "settings", source, constraint: "^2.0.0", enabled: true },
          {
            type: "pack",
            pack: "@acme/packs/platform",
            manifestPath: `${root}/agent_extensions/@acme/packs/platform/pack.json`,
            source: "@acme/rules/release",
            constraint: "^2.0.0",
            enabled: true,
          },
        ],
      };
      const observed = yield* observeCanonicalExtension({
        layout,
        desired,
        accepted: {
          type: "registry",
          owner: handle("@acme"),
          name: extensionName("release"),
          resolvedVersion: exactVersion("1.9.0"),
          integrity: "sha512-archive",
          sourceName: "default",
          publisherBindingId: "binding-1",
          treeIntegrity: placeholderTreeIntegrity,
        },
      });
      expect(observed.status).toBe("constraint-mismatch");
      if (observed.status === "constraint-mismatch") {
        expect(observed.acceptedVersion).toBe("1.9.0");
        expect(observed.authority).toMatchObject({
          source: "desired-state-graph",
          identity: "@acme/rules/release",
          locator: source,
          constraints: [
            { source: "settings", range: "^2.0.0" },
            {
              source: "pack",
              dependingPack: "@acme/packs/platform",
              range: "^2.0.0",
            },
          ],
        });
      }
    }),
  );

  it.effect("observes authored workspace content without a lock row", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const source = "workspace:@acme/skills/review";
      const desired = desiredSkill(source);
      const canonical = nodePath.join(root, "skills", "review");
      nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "skill.json"),
        JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        }),
      );
      nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Authored\n");
      const observed = yield* observeCanonicalExtension({
        layout,
        desired,
        accepted: undefined,
      });
      expect(observed.status).toBe("usable");
    }),
  );

  it.effect("evaluates pack constraints against an authored workspace manifest", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const source = "workspace:@acme/rules/release";
      const desired: DesiredExtensionNode = {
        type: "rule",
        name: "release",
        identity: source,
        source,
        enabled: true,
        constraints: ["^2.0.0"],
        origins: [
          { type: "settings", source, enabled: true },
          {
            type: "pack",
            pack: "@acme/packs/release",
            manifestPath: `${root}/packs/release/pack.json`,
            source: "@acme/rules/release",
            constraint: "^2.0.0",
            enabled: true,
          },
        ],
      };
      const canonical = nodePath.join(root, "rules", "release");
      nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "rule.json"),
        JSON.stringify({
          $schema: "https://axm.sh/schemas/rule.schema.json",
          type: "rule",
          name: "release",
          owner: "@acme",
          version: "2.1.0",
          description: "Release policy",
        }),
      );
      nodeFs.writeFileSync(nodePath.join(canonical, "src", "RULE.md"), "# Release\n");

      const observed = yield* observeCanonicalExtension({
        layout,
        desired,
        accepted: undefined,
      });

      expect(observed.status).toBe("usable");
    }),
  );
});
